"""
SRM FastAPI server — exposes the SR pipeline via HTTP for the Next.js frontend.

GPU constraint (RTX 3050 6GB):
- asyncio.Queue ensures only ONE GPU job runs at a time.
- Concurrent requests are queued, not rejected.
- /api/sr/status/:jobId returns queue_position so the UI can show a live queue.

Run with:
    .venv\\Scripts\\python.exe -m uvicorn srm_api.main:app --host 0.0.0.0 --port 8000 --reload
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from srm_api.schemas import (
    SRRequest, JobStatus, SRResult, BandMetrics, BandPreservationStat,
)
from srm_api.db import (
    init_db, upsert_scan, get_scans, get_scan, backfill_from_outputs,
    resolve_location_name, fix_legacy_location_names,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    backfill_from_outputs(OUTPUT_DIR)
    fix_legacy_location_names()
    worker_task = asyncio.create_task(_gpu_worker())
    logger.info("GPU worker started. One SR job runs at a time.")
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="SRM API",
    description=(
        "Sentinel-2 Super-Resolution — flexible lat/lon input. "
        "Click a point on the map, fetch a 128×128 px patch, and super-resolve it to 2.5 m."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Serve output PNGs at /static/<filename>
app.mount("/static", StaticFiles(directory=str(OUTPUT_DIR)), name="static")

# ── In-memory job store ────────────────────────────────────────────────────
# For production: replace with Redis + Celery. For SIH demo: dict is fine.
_jobs: Dict[str, dict] = {}   # job_id → {"status", "result", "request"}
_queue: asyncio.Queue = asyncio.Queue()


# ── GPU worker coroutine — runs exactly ONE job at a time ─────────────────
async def _gpu_worker() -> None:
    """Background task: drain _queue one job at a time."""
    while True:
        try:
            job_id, req = await _queue.get()
            _jobs[job_id]["status"] = "running"
            _jobs[job_id]["started_at"] = time.time()
            _jobs[job_id]["progress_pct"] = 8
            _jobs[job_id]["stage"] = "acquisition"
            _jobs[job_id]["progress_msg"] = f"Initializing acquisition for ({req.lat:.4f}, {req.lon:.4f})..."
            try:
                upsert_scan({"job_id": job_id, "status": "running"})
            except Exception as dbe:
                logger.warning("Could not update scan to running in SQLite: %s", dbe)

            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    _run_sr_blocking,
                    job_id,
                    req,
                )
                _jobs[job_id]["status"] = "done"
                _jobs[job_id]["result"] = result
                _jobs[job_id]["progress_pct"] = 100
                _jobs[job_id]["stage"] = "done"
                _jobs[job_id]["progress_msg"] = "Super-Resolution Mapping complete"

                # Compute mean preservation if band_stats available
                pres_pct = None
                if result.band_stats and len(result.band_stats) > 0:
                    pres_pct = round(sum(s.preservation_pct for s in result.band_stats) / len(result.band_stats), 2)

                now_iso = datetime.now(timezone.utc).isoformat()
                try:
                    upsert_scan({
                        "job_id": job_id,
                        "status": "done",
                        "completed_at": now_iso,
                        "processing_time_s": result.processing_time_s,
                        "scale_factor": req.scale_factor,
                        "psnr_db": result.metrics.psnr_db,
                        "ssim": result.metrics.ssim,
                        "sam_deg": result.metrics.sam_deg,
                        "ergas": result.metrics.ergas,
                        "preservation_pct": pres_pct,
                        "thumbnail_url": result.sr_rgb_url,
                        "lr_rgb_url": result.lr_rgb_url,
                        "sr_rgb_url": result.sr_rgb_url,
                        "uncertainty_url": result.uncertainty_url,
                        "spectral_chart_url": result.spectral_chart_url,
                        "ndvi_url": result.ndvi_url,
                        "mndwi_url": result.mndwi_url,
                        "ndbi_url": result.ndbi_url,
                    })
                except Exception as dbe:
                    logger.warning("Could not persist done scan in SQLite: %s", dbe)
            except Exception as exc:
                logger.exception("[%s] Job failed: %s", job_id, exc)
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["progress_msg"] = str(exc)
                try:
                    upsert_scan({"job_id": job_id, "status": "error"})
                except Exception:
                    pass
            finally:
                _queue.task_done()
        except Exception as loop_err:
            logger.exception("Error in GPU worker queue processing: %s", loop_err)
            await asyncio.sleep(1)


def _run_sr_blocking(job_id: str, req: SRRequest) -> SRResult:
    """Synchronous SR execution — called in executor to avoid blocking asyncio."""
    from srm.flexible_input import run_sr_from_latlon

    def on_progress(pct: int, msg: str, stage: str) -> None:
        if job_id in _jobs:
            _jobs[job_id]["progress_pct"] = pct
            _jobs[job_id]["progress_msg"] = msg
            _jobs[job_id]["stage"] = stage

    flex = run_sr_from_latlon(
        lat=req.lat,
        lon=req.lon,
        output_dir=OUTPUT_DIR,
        job_id=job_id,
        n_uncertainty=req.n_uncertainty,
        sampling_steps=req.sampling_steps,
        run_lam=req.run_lam,
        scale_factor=req.scale_factor,
        progress_callback=on_progress,
    )

    def _url(suffix: str) -> str:
        return f"/static/{job_id}_{suffix}"

    band_stats_models = None
    if flex.band_stats:
        band_stats_models = [BandPreservationStat(**s) for s in flex.band_stats]

    return SRResult(
        job_id=job_id,
        lat=req.lat,
        lon=req.lon,
        sr_rgb_url=_url("sr_rgb.png"),
        lr_rgb_url=_url("lr_rgb.png"),
        uncertainty_url=_url("uncertainty.png"),
        spectral_chart_url=_url("spectral_chart.png"),
        lam_url=_url("lam.png") if req.run_lam else None,
        ndvi_url=_url("ndvi.png"),
        lr_ndvi_url=_url("lr_ndvi.png"),
        mndwi_url=_url("mndwi.png"),
        lr_mndwi_url=_url("lr_mndwi.png"),
        ndbi_url=_url("ndbi.png"),
        lr_ndbi_url=_url("lr_ndbi.png"),
        metrics=BandMetrics(**flex.metrics),
        band_stats=band_stats_models,
        patch_size_px=128,
        output_size_px=flex.output_size_px,
        lr_resolution_m=10.0,
        sr_resolution_m=flex.sr_resolution_m,
        processing_time_s=flex.processing_time_s,
        sampling_steps_used=flex.sampling_steps_used,
        scale_factor=flex.scale_factor,
    )


def _recover_job_from_disk(job_id: str) -> Optional[SRResult]:
    """Recover or reconstruct job result from artifacts on disk if server restarted."""
    matches = list(OUTPUT_DIR.glob(f"{job_id}_sr_10band*.tif"))
    sr_tif = matches[0] if matches else OUTPUT_DIR / f"{job_id}_sr_10band_2.5m.tif"
    sr_png = OUTPUT_DIR / f"{job_id}_sr_rgb.png"
    if not (sr_tif.exists() or sr_png.exists()):
        return None

    # Detect resolution & dimensions from artifacts
    recovered_scale = 4
    recovered_size = 512
    recovered_res = 2.5
    if sr_png.exists():
        try:
            from PIL import Image
            with Image.open(sr_png) as img:
                if img.width >= 2000:
                    recovered_scale = 8
                    recovered_size = 2048
                    recovered_res = 0.625
        except Exception:
            pass

    stats_json = OUTPUT_DIR / f"{job_id}_band_stats.json"
    chart_png = OUTPUT_DIR / f"{job_id}_spectral_chart.png"
    band_stats = None

    if stats_json.exists():
        import json
        try:
            with open(stats_json, encoding="utf-8") as f:
                band_stats = [BandPreservationStat(**s) for s in json.load(f)]
        except Exception as e:
            logger.warning("Failed loading %s: %s", stats_json, e)

    if not band_stats and sr_tif.exists():
        try:
            import json, rasterio
            from srm.flexible_input import BAND_METADATA_10B, generate_spectral_chart_file
            with rasterio.open(sr_tif) as src:
                sr_data = src.read()
            c, h, w = sr_data.shape
            step = 16 if recovered_scale == 8 else 4
            lr_data = sr_data.reshape(c, h // step, step, w // step, step).mean(axis=(2, 4))
            raw_stats = []
            for i, m in enumerate(BAND_METADATA_10B):
                lr_m = float(lr_data[i].mean())
                sr_m = float(sr_data[i].mean())
                diff = abs(sr_m - lr_m)
                pres_pct = max(0.0, min(100.0, (1.0 - diff / (lr_m + 1e-6)) * 100))
                raw_stats.append({
                    "band": m["band"],
                    "name": m["name"],
                    "wavelength_nm": m["wavelength"],
                    "lr_mean": round(lr_m, 4),
                    "sr_mean": round(sr_m, 4),
                    "lr_std": round(float(lr_data[i].std()), 4),
                    "sr_std": round(float(sr_data[i].std()), 4),
                    "abs_diff": round(diff, 6),
                    "preservation_pct": round(pres_pct, 2),
                })
            with open(stats_json, "w", encoding="utf-8") as f:
                json.dump(raw_stats, f, indent=2)
            generate_spectral_chart_file(raw_stats, chart_png)
            band_stats = [BandPreservationStat(**s) for s in raw_stats]
        except Exception as e:
            logger.warning("Failed calculating band stats for %s: %s", job_id, e)

    def _url(suffix: str) -> Optional[str]:
        p = OUTPUT_DIR / f"{job_id}_{suffix}"
        return f"/static/{job_id}_{suffix}" if p.exists() else None

    result = SRResult(
        job_id=job_id,
        lat=20.5937,
        lon=78.9629,
        sr_rgb_url=_url("sr_rgb.png") or f"/static/{job_id}_sr_rgb.png",
        lr_rgb_url=_url("lr_rgb.png") or f"/static/{job_id}_lr_rgb.png",
        uncertainty_url=_url("uncertainty.png") or f"/static/{job_id}_uncertainty.png",
        spectral_chart_url=_url("spectral_chart.png"),
        lam_url=_url("lam.png"),
        ndvi_url=_url("ndvi.png"),
        lr_ndvi_url=_url("lr_ndvi.png"),
        mndwi_url=_url("mndwi.png"),
        lr_mndwi_url=_url("lr_mndwi.png"),
        ndbi_url=_url("ndbi.png"),
        lr_ndbi_url=_url("lr_ndbi.png"),
        metrics=BandMetrics(),
        band_stats=band_stats,
        patch_size_px=128,
        output_size_px=recovered_size,
        lr_resolution_m=10.0,
        sr_resolution_m=recovered_res,
        processing_time_s=60.0,
        scale_factor=recovered_scale,
    )
    _jobs[job_id] = {"status": "done", "result": result, "request": None}
    return result

# ── Endpoints ──────────────────────────────────────────────────────────────

@app.post("/api/sr/submit", response_model=JobStatus, status_code=202)
async def submit_sr_job(req: SRRequest) -> JobStatus:
    """Submit a new SR job. Returns immediately with job_id and queue position."""
    job_id = uuid.uuid4().hex[:12]
    now_iso = datetime.now(timezone.utc).isoformat()
    queue_size_before = _queue.qsize()
    _jobs[job_id] = {
        "status": "queued",
        "result": None,
        "request": req,
        "progress_pct": 0,
        "stage": "queued",
        "progress_msg": f"Queued (position {queue_size_before + 1})",
        "queued_at": time.time(),
    }
    await _queue.put((job_id, req))

    # Persist queued scan to SQLite with resolved area name
    area_name = resolve_location_name(req.lat, req.lon)
    upsert_scan({
        "job_id": job_id,
        "lat": req.lat,
        "lon": req.lon,
        "location_name": area_name,
        "event_category": "Planetary Scan",
        "sampling_steps": req.sampling_steps,
        "status": "queued",
        "created_at": now_iso,
    })

    return JobStatus(
        job_id=job_id,
        status="queued",
        queue_position=queue_size_before + 1,
        progress_msg=f"Queued (position {queue_size_before + 1})",
        progress_pct=0,
        stage="queued",
        elapsed_s=0.0,
    )


@app.get("/api/sr/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str) -> JobStatus:
    """Poll job status. Frontend polls this every 3 seconds."""
    if job_id not in _jobs:
        recovered = _recover_job_from_disk(job_id)
        if not recovered:
            raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    job = _jobs[job_id]
    status = job["status"]

    queue_pos = None
    if status == "queued":
        queue_list = list(_queue._queue)  # type: ignore[attr-defined]
        ids = [item[0] for item in queue_list]
        queue_pos = ids.index(job_id) + 1 if job_id in ids else 1

    elapsed = None
    if "started_at" in job:
        elapsed = round(time.time() - job["started_at"], 1)
    elif "queued_at" in job:
        elapsed = round(time.time() - job["queued_at"], 1)

    return JobStatus(
        job_id=job_id,
        status=status,
        queue_position=queue_pos,
        progress_msg=job.get("progress_msg"),
        progress_pct=job.get("progress_pct"),
        stage=job.get("stage"),
        elapsed_s=elapsed,
    )


@app.get("/api/sr/result/{job_id}", response_model=SRResult)
async def get_job_result(job_id: str) -> SRResult:
    """Fetch the full result. Only valid after status == 'done'."""
    if job_id not in _jobs:
        recovered = _recover_job_from_disk(job_id)
        if not recovered:
            raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    job = _jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(
            status_code=409,
            detail=f"Job {job_id!r} is {job['status']}, not done yet.",
        )
    return job["result"]


# ── SQLite Past Scans & History Endpoints ─────────────────────────────────

@app.get("/api/scans")
async def list_past_scans(
    limit: int = 50,
    offset: int = 0,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """Retrieve historical scans stored in SQLite."""
    return get_scans(limit=limit, offset=offset, category=category, search=search)


@app.get("/api/scans/{job_id}")
async def get_scan_details(job_id: str) -> dict:
    """Retrieve details for a single historical scan."""
    scan = get_scan(job_id)
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {job_id!r} not found in database")
    return scan


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "jobs_total": len(_jobs),
        "queue_depth": _queue.qsize(),
    }
