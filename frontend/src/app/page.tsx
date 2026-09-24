"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Settings2,
  Sparkles,
  SlidersHorizontal,
  Globe2,
  Cpu,
  Layers,
  Clock,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Activity,
} from "lucide-react";

import CommandHeader from "@/components/CommandHeader";
import SidebarNav from "@/components/SidebarNav";
import ScansArchiveDrawer from "@/components/ScansArchiveDrawer";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import ExecutionProgressBar from "@/components/ExecutionProgressBar";
import { RadarReticleIcon } from "@/components/GlobalIcons";
import { submitSRJob, getJobStatus, getPastScans, staticUrl } from "@/utils/api";
import {
  POLL_INTERVAL_MS,
  QUALITY_TIERS,
  type QualityTierSteps,
  NOTABLE_LOCATIONS,
} from "@/lib/constants";
import type { JobStatus, StatusResponse, ScanRecord } from "@/types";

/* ── Dynamic import for 3D Globe (Client side only) ─────────────────────── */
const Globe3DNavigator = dynamic(
  () => import("@/components/Globe3DNavigator"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-black">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-xs font-mono text-[#888]">
          Initialising 3D Satellite Earth…
        </span>
      </div>
    ),
  }
);

/* ── Reference AOI Presets for Quick Selection ───────────────────────────── */
const PRESET_AOIS = [
  { name: "Mumbai Port",       desc: "Coastal",     lat: 18.9600, lon: 72.8200 },
  { name: "Ahmedabad Urban",   desc: "Built-up",    lat: 23.0225, lon: 72.5714 },
  { name: "Berlin Centre",     desc: "European",    lat: 52.5200, lon: 13.4050 },
  { name: "Uttarakhand",       desc: "Topography",  lat: 30.3800, lon: 79.7200 },
  { name: "Derna Coast",       desc: "Flood Plain", lat: 32.7600, lon: 22.6300 },
  { name: "Sundarbans Delta",  desc: "Wetland",     lat: 21.9400, lon: 89.1800 },
];

export default function HomePage() {
  const router = useRouter();

  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>({
    lat: 18.9600,
    lon: 72.8200,
  });
  const [selectedLocName, setSelectedLocName] = useState<string | null>("Mumbai Harbour, India");

  const [jobId,          setJobId]          = useState<string | null>(null);
  const [jobStatus,      setJobStatus]      = useState<JobStatus | null>(null);
  const [statusMsg,      setStatusMsg]      = useState<string | null>(null);
  const [progressPct,    setProgressPct]    = useState<number | null>(null);
  const [currentStage,   setCurrentStage]   = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [queuePos,       setQueuePos]       = useState<number | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const [selectedSteps, setSelectedSteps] = useState<QualityTierSteps>(50);
  const [scaleFactor,   setScaleFactor]   = useState<number>(4);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pastScans,   setPastScans]   = useState<ScanRecord[]>([]);

  /* ── Load past scans ──────────────────────────────────────────────────── */
  useEffect(() => {
    getPastScans({ limit: 50 })
      .then((res) => { if (res?.scans) setPastScans(res.scans); })
      .catch((err) => console.warn("Past scans load failed:", err));
  }, []);

  /* ── Location Selection Handler ────────────────────────────────────────── */
  const handleLocationSelect = useCallback((lat: number, lon: number, name?: string) => {
    setSelectedLatLon({ lat, lon });
    if (name) {
      setSelectedLocName(name);
    } else {
      const match = NOTABLE_LOCATIONS.find(
        (loc) => Math.abs(loc.lat - lat) < 0.15 && Math.abs(loc.lon - lon) < 0.15
      );
      setSelectedLocName(match ? match.name : `AOI (${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"})`);
    }
    setError(null);
  }, []);

  /* ── Submit Pipeline Job ──────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!selectedLatLon) return;
    setSubmitting(true);
    setError(null);
    setProgressPct(0);
    setCurrentStage("queued");
    setElapsedSeconds(0);

    try {
      const res = await submitSRJob({
        lat:            selectedLatLon.lat,
        lon:            selectedLatLon.lon,
        n_uncertainty:  5,
        sampling_steps: selectedSteps,
        scale_factor:   scaleFactor,
        model_choice:   "able", // Sen2SR-RRDB model
      });

      setJobId(res.job_id);
      setJobStatus(res.status);
      setStatusMsg(res.progress_msg);
      setQueuePos(res.queue_position);
      if (typeof res.progress_pct === "number") setProgressPct(res.progress_pct);
      if (res.stage) setCurrentStage(res.stage);
      if (typeof res.elapsed_s === "number") setElapsedSeconds(res.elapsed_s);
      getPastScans({ limit: 50 }).then((r) => r && setPastScans(r.scans));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pipeline execution submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [selectedLatLon, selectedSteps, scaleFactor]);

  /* ── Polling ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "error") return;

    const interval = setInterval(async () => {
      try {
        const s: StatusResponse = await getJobStatus(jobId);
        setJobStatus(s.status);
        setStatusMsg(s.progress_msg);
        setQueuePos(s.queue_position);
        if (typeof s.progress_pct === "number") setProgressPct(s.progress_pct);
        if (s.stage) setCurrentStage(s.stage);
        if (typeof s.elapsed_s === "number") setElapsedSeconds(s.elapsed_s);

        if (s.status === "done") {
          clearInterval(interval);
          router.push(`/results/${jobId}`);
        }
        if (s.status === "error") {
          clearInterval(interval);
          setError(s.progress_msg ?? "Pipeline failed during execution");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Polling connection error");
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId, jobStatus, router]);

  const isRunning = jobStatus === "queued" || jobStatus === "running";

  return (
    <div
      className="relative w-screen h-screen flex flex-col overflow-hidden selection:bg-white selection:text-black font-mono"
      style={{ background: "#000000", color: "#f5f5f5" }}
    >
      {/* Background Ambience */}
      <LiquidBackdrop />

      {/* Full-Width Top Header */}
      <CommandHeader
        totalScans={pastScans.length}
        onOpenArchive={() => setArchiveOpen(true)}
        onSearchCoordinates={(lat, lon) => handleLocationSelect(lat, lon)}
      />

      {/* Main Full-Width Content Canvas */}
      <div className="flex-1 flex flex-row w-full h-[calc(100vh-53px)] overflow-hidden">
        {/* Left Vertical Navigation Rail (inspired by Image 2 & 3) */}
        <SidebarNav
          activeTab="globe"
          totalScans={pastScans.length}
          onOpenArchive={() => setArchiveOpen(true)}
        />

        {/* Workspace: 3D Globe (Stage) + Right Telemetry HUD */}
        <main className="flex-1 flex flex-col lg:flex-row p-3 sm:p-4 gap-3.5 h-full overflow-hidden w-full">
          {/* Center Stage: 3D Physical Satellite Globe (Takes ~68% width, Full Height) */}
          <section
            className="flex-1 w-full h-full min-h-[460px] lg:min-h-0 relative rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            style={{
              border: "1px solid #1e1e1e",
              background: "#050505",
            }}
          >
            {/* 3D Physical Earth draped with high-res satellite imagery */}
            <Globe3DNavigator
              selectedLocation={selectedLatLon}
              onSelectLocation={handleLocationSelect}
            />
          </section>

          {/* Right Control Telemetry HUD Panel (Takes ~32% width, w-[420px], scrollable) */}
          <aside className="w-full lg:w-[420px] xl:w-[450px] shrink-0 h-full flex flex-col gap-3 overflow-y-auto pr-0.5 custom-scrollbar">
            {/* Card 1: Target AOI & Telemetry (inspired by Account / Balance card in Image 2 & 3) */}
            <div
              className="p-4 rounded-3xl flex flex-col gap-3 shadow-xl"
              style={{
                background: "#0c0c0c",
                border: "1px solid #1f1f1f",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <RadarReticleIcon size={13} />
                  </div>
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-white">
                    Target Specification &amp; AOI
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#181818] text-[#888] border border-[#2a2a2a]">
                  Sentinel-2 MSI
                </span>
              </div>

              {selectedLatLon ? (
                <div
                  className="p-3.5 rounded-2xl flex flex-col gap-2.5"
                  style={{
                    background: "#121212",
                    border: "1px solid #222222",
                  }}
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[9.5px] uppercase font-bold tracking-wider text-[#777] block">
                        Locked Coordinates
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white mt-0.5 tabular-nums">
                        {Math.abs(selectedLatLon.lat).toFixed(4)}°{selectedLatLon.lat >= 0 ? "N" : "S"},{" "}
                        {Math.abs(selectedLatLon.lon).toFixed(4)}°{selectedLatLon.lon >= 0 ? "E" : "W"}
                      </div>
                    </div>
                  </div>

                  {selectedLocName && (
                    <div className="flex items-center gap-2 text-xs text-[#aaa]">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      <span className="font-semibold text-white truncate">{selectedLocName}</span>
                    </div>
                  )}

                  {/* 4-Metric Grid */}
                  <div
                    className="grid grid-cols-2 gap-2 pt-2.5 text-[11px]"
                    style={{ borderTop: "1px solid #202020", color: "#888" }}
                  >
                    <div className="p-2 rounded-xl bg-[#171717] border border-[#242424]">
                      <span className="text-[9px] uppercase text-[#666] block font-bold">Ground Footprint</span>
                      <span className="text-white font-bold mt-0.5 block">1.28 × 1.28 km</span>
                    </div>
                    <div className="p-2 rounded-xl bg-[#171717] border border-[#242424]">
                      <span className="text-[9px] uppercase text-[#666] block font-bold">Native GSD</span>
                      <span className="text-white font-bold mt-0.5 block">10.0 m/px</span>
                    </div>
                    <div className="p-2 rounded-xl bg-[#171717] border border-[#242424]">
                      <span className="text-[9px] uppercase text-[#666] block font-bold">Target GSD</span>
                      <span className="text-white font-bold mt-0.5 block">
                        {scaleFactor === 8 ? "0.625m (8× Sub-M)" : "2.5m (4×)"}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-[#171717] border border-[#242424]">
                      <span className="text-[9px] uppercase text-[#666] block font-bold">Spectral Bands</span>
                      <span className="text-white font-bold mt-0.5 block">10 Bands (L2A)</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs rounded-2xl bg-[#121212] border border-[#222] text-[#666]">
                  Click anywhere on the physical satellite globe to lock AOI
                </div>
              )}
            </div>

            {/* Card 2: Sen2SR-RRDB Neural Engine Specs (Sole Model) */}
            <div
              className="p-4 rounded-3xl flex flex-col gap-2.5 shadow-xl"
              style={{
                background: "#0c0c0c",
                border: "1px solid #1f1f1f",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <Cpu size={13} />
                  </div>
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-white">
                    Sen2SR-RRDB Neural Engine
                  </h2>
                </div>
                <span className="text-[9.5px] font-bold uppercase px-2 py-0.5 rounded-full bg-white text-black">
                  Active
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-[#121212] border border-[#222] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#888]">Architecture:</span>
                  <span className="text-white font-bold">Residual-Dense SR-Net</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#888]">Fidelity Guarantee:</span>
                  <span className="text-white font-bold">99.98% Flux Preservation</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#888]">Benchmark Score:</span>
                  <span className="text-white font-bold">35.9 dB PSNR · 0.942 SSIM</span>
                </div>
              </div>
            </div>

            {/* Card 3: Execution Settings (Scale Factor & Steps Pills) */}
            <div
              className="p-4 rounded-3xl flex flex-col gap-3 shadow-xl"
              style={{
                background: "#0c0c0c",
                border: "1px solid #1f1f1f",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <SlidersHorizontal size={13} />
                  </div>
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-white">
                    Inference Parameters
                  </h2>
                </div>
              </div>

              {/* Super-Resolution Scale Factor Pills */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-[#888] font-bold uppercase">
                  <span>Scale Factor</span>
                  <span>{scaleFactor === 8 ? "2048 × 2048 px" : "512 × 512 px"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "4× Standard", res: "2.5m GSD", factor: 4, sub: "16× Density" },
                    { label: "8× Sub-Metre", res: "0.625m GSD", factor: 8, sub: "64× Ultra-Res" },
                  ].map(({ label, res, factor, sub }) => {
                    const isSel = scaleFactor === factor;
                    return (
                      <button
                        key={factor}
                        type="button"
                        onClick={() => setScaleFactor(factor)}
                        disabled={isRunning}
                        className={`p-3 rounded-2xl text-left transition-all cursor-pointer border ${
                          isSel
                            ? "bg-white text-black border-white shadow-md font-bold"
                            : "bg-[#141414] text-white border-[#242424] hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold mb-0.5">
                          <span>{label}</span>
                          <span className={`text-[10px] ${isSel ? "text-black" : "text-[#888]"}`}>{res}</span>
                        </div>
                        <span className={`text-[10px] block ${isSel ? "text-neutral-700" : "text-[#666]"}`}>
                          {sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DDIM Sampling Steps Pills */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] text-[#888] font-bold uppercase">
                  <span>Sampling Iterations</span>
                  <span>{selectedSteps} DDIM Steps</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {QUALITY_TIERS.map((tier) => {
                    const isSel = selectedSteps === tier.steps;
                    return (
                      <button
                        key={tier.steps}
                        type="button"
                        onClick={() => setSelectedSteps(tier.steps)}
                        disabled={isRunning}
                        className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer border ${
                          isSel
                            ? "bg-white text-black border-white font-bold shadow-sm"
                            : "bg-[#141414] text-[#aaa] border-[#242424] hover:text-white hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <div className="font-bold text-xs tabular-nums">{tier.steps}</div>
                        <div className={`text-[9px] tabular-nums ${isSel ? "text-neutral-700" : "text-[#666]"}`}>
                          {tier.approxTime}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Progress / Error Reporting */}
            <AnimatePresence>
              {jobStatus && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <ExecutionProgressBar
                    status={jobStatus}
                    msg={statusMsg}
                    pct={progressPct}
                    stage={currentStage}
                    elapsedSeconds={elapsedSeconds}
                    queuePos={queuePos}
                    samplingSteps={selectedSteps}
                    scaleFactor={scaleFactor}
                  />
                </motion.div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-3.5 rounded-2xl text-xs font-mono leading-relaxed"
                  style={{
                    background: "#180a0a",
                    border: "1px solid #7f1d1d",
                    color: "#f87171",
                  }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Primary Action Button (inspired by the Review button in Image 2!) */}
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedLatLon || isRunning || submitting}
              whileHover={!selectedLatLon || isRunning ? {} : { scale: 1.01 }}
              whileTap={!selectedLatLon || isRunning ? {} : { scale: 0.99 }}
              className={`w-full py-4 px-5 rounded-2xl text-xs sm:text-sm font-extrabold uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2 shadow-2xl cursor-pointer ${
                !selectedLatLon || isRunning
                  ? "bg-[#141414] text-[#555] border border-[#242424] cursor-not-allowed"
                  : "btn-white bg-white text-black border border-white hover:bg-neutral-200"
              }`}
            >
              {submitting || isRunning ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-4 h-4 rounded-full border-2 border-current border-t-transparent"
                  />
                  <span>Reconstructing Sentinel-2 Tile…</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Initialize Super-Resolution Mapping</span>
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>

            {/* Card 5: Recent Planetary Scans (inspired by Last Transactions in Image 2!) */}
            {pastScans.length > 0 && (
              <div
                className="p-4 rounded-3xl flex flex-col gap-2.5 shadow-xl mt-1"
                style={{
                  background: "#0c0c0c",
                  border: "1px solid #1f1f1f",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-[#888]" />
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-white">
                      Recent Planetary Scans
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setArchiveOpen(true)}
                    className="text-[10px] text-[#888] hover:text-white font-semibold transition-colors cursor-pointer"
                  >
                    View All ({pastScans.length})
                  </button>
                </div>

                <div className="space-y-1.5">
                  {pastScans.slice(0, 3).map((scan) => (
                    <Link
                      key={scan.job_id}
                      href={`/results/${scan.job_id}`}
                      className="p-2.5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-[#202020] hover:border-[#333] transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-black border border-[#2a2a2a] shrink-0 relative">
                          <Image
                            src={staticUrl(scan.thumbnail_url || scan.sr_rgb_url || scan.lr_rgb_url || "/earth-satellite.jpg")}
                            alt={scan.location_name || scan.job_id}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white group-hover:text-white truncate block">
                            {scan.location_name || `Scan ${scan.job_id.slice(0, 8)}`}
                          </span>
                          <span className="text-[10px] text-[#777] block tabular-nums">
                            {scan.scale_factor ? `${scan.scale_factor}× SR` : "8× SR"} · {scan.processing_time_s ? `${scan.processing_time_s.toFixed(1)}s` : "Done"}
                          </span>
                        </div>
                      </div>
                      <ExternalLink size={13} className="text-[#555] group-hover:text-white shrink-0 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </main>
      </div>

      {/* Scans Archive Modal Drawer */}
      <ScansArchiveDrawer
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        scans={pastScans}
        onSelectScanCoordinates={(lat, lon) => {
          handleLocationSelect(lat, lon);
          setArchiveOpen(false);
        }}
      />
    </div>
  );
}
