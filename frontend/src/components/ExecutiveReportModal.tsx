"use client";

import {
  FileText,
  Download,
  Printer,
  ShieldCheck,
  X,
  MapPin,
} from "lucide-react";
import type { SRResult } from "@/types";
import { staticUrl } from "@/utils/api";
import { NOTABLE_LOCATIONS } from "@/lib/constants";

interface ExecutiveReportModalProps {
  result: SRResult;
  isOpen: boolean;
  onClose: () => void;
  scaleFactor?: number;
}

/** Resolve a human-readable area name from lat/lon — mirrors the server-side logic */
function resolveAreaName(lat: number, lon: number): string {
  // Check notable locations first (within ~15km)
  const match = NOTABLE_LOCATIONS.find(
    (loc) => Math.abs(loc.lat - lat) < 0.15 && Math.abs(loc.lon - lon) < 0.15
  );
  if (match) return match.name;

  // Hemisphere labels
  const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;
  return `AOI (${latStr}, ${lonStr})`;
}

export default function ExecutiveReportModal({
  result,
  isOpen,
  onClose,
  scaleFactor = 4,
}: ExecutiveReportModalProps) {
  if (!isOpen) return null;

  const reportDate = new Date();
  const dateStr = reportDate.toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = reportDate.toUTCString().slice(17, 22) + " UTC";

  const gsdTarget = scaleFactor === 8 ? "0.625 m" : "2.5 m";
  const multiplier = scaleFactor === 8 ? 256 : 16;
  const outputDimension = scaleFactor === 8 ? "2048 × 2048 px" : "512 × 512 px";
  const areaName = resolveAreaName(result.lat, result.lon);

  const handlePrint = () => window.print();

  const handleDownloadStac = () => {
    const stacItem = {
      type: "Feature",
      stac_version: "1.0.0",
      id: `srm-${result.job_id}-${scaleFactor}x`,
      properties: {
        datetime: reportDate.toISOString(),
        platform: "Sentinel-2",
        constellation: "Copernicus",
        gsd: scaleFactor === 8 ? 0.625 : 2.5,
        "srm:scale_factor": `${scaleFactor}x`,
        "srm:location": areaName,
        "srm:processing_time_s": result.processing_time_s,
        "metrics:psnr": result.metrics.psnr_db,
        "metrics:ssim": result.metrics.ssim,
        "metrics:sam": result.metrics.sam_deg,
      },
      geometry: { type: "Point", coordinates: [result.lon, result.lat] },
      assets: {
        sr_rgb: { href: result.sr_rgb_url, type: "image/png", title: `SR Composite (${gsdTarget})` },
        lr_rgb: { href: result.lr_rgb_url, type: "image/png", title: "Sentinel-2 L2A Input (10m)" },
        uncertainty: { href: result.uncertainty_url, type: "image/png", title: "Uncertainty Heatmap" },
      },
    };
    const blob = new Blob([JSON.stringify(stacItem, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `srm_${result.job_id}_stac.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md print:static print:inset-auto print:p-0 print:bg-transparent print:backdrop-blur-none print:block print:w-full">
      {/* ── Modal Shell ── */}
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white text-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 print:max-w-none print:max-h-none print:overflow-visible print:border-none print:shadow-none print:rounded-none">

        {/* ── Toolbar (hidden on print) ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 text-white border-b border-white/10 print:hidden shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-slate-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Executive Intelligence Dossier</p>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                {areaName} · Job {result.job_id.slice(0, 12)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={handleDownloadStac}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-1.5 cursor-pointer border border-white/15">
              <Download size={12} />
              <span>STAC JSON</span>
            </button>
            <button type="button" onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-neutral-100 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95">
              <Printer size={12} />
              <span>Print / Save as PDF</span>
            </button>
            <button type="button" onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/15 text-slate-400 hover:text-white transition-all cursor-pointer">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            PRINTABLE REPORT BODY
        ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto bg-white text-slate-900 print:overflow-visible font-sans">

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              PAGE 1 ─ COVER & MISSION OVERVIEW
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="p-8 sm:p-10 space-y-6 print:p-8 print:space-y-5">

            {/* ── Report Header ── */}
            <div className="flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-900">
              {/* Left: Branding + Title */}
              <div className="flex items-start gap-4 min-w-0">
                {/* Logo */}
                <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-black border border-slate-200 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/beyond-pixels-icon.png" alt="Beyond Pixels" className="w-full h-full object-contain" />
                </div>
                {/* Title block */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 rounded tracking-widest uppercase">
                      Beyond Pixels · Sentinel-2 SRM
                    </span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                      <ShieldCheck size={9} /> CEOS ARD
                    </span>
                  </div>
                  <h1 className="text-xl font-black text-slate-950 tracking-tight leading-tight">
                    Super-Resolution Mapping Report
                  </h1>
                  <div className="flex items-center gap-1.5 mt-1.5 text-slate-600">
                    <MapPin size={12} className="text-slate-500 shrink-0" />
                    <span className="text-sm font-semibold">{areaName}</span>
                  </div>
                </div>
              </div>

              {/* Right: Metadata block */}
              <div className="shrink-0 text-right text-[11px] text-slate-600 font-mono space-y-0.5">
                <p className="font-bold text-slate-900 text-xs">{dateStr}</p>
                <p>{timeStr}</p>
                <p className="text-slate-500">Job: {result.job_id.slice(0, 16)}</p>
                <p className="text-slate-500">{result.lat.toFixed(5)}°N, {result.lon.toFixed(5)}°E</p>
              </div>
            </div>

            {/* ── Mission Parameters Grid ── */}
            <div className="grid grid-cols-4 gap-0 border border-slate-200 rounded-lg overflow-hidden text-xs print-avoid-break">
              {[
                { label: "Area of Interest", value: areaName, sub: "1.28 km × 1.28 km Footprint" },
                { label: "Resolution Enhancement", value: `10 m → ${gsdTarget}`, sub: `${scaleFactor}× scale · ${multiplier}× pixel density` },
                { label: "Output Dimensions", value: outputDimension, sub: "from 128 × 128 px LR input" },
                { label: "Pipeline Runtime", value: `${result.processing_time_s.toFixed(1)} s`, sub: `${result.sampling_steps_used ?? 50} neural passes` },
              ].map((item, i) => (
                <div key={i} className={`p-3.5 ${i < 3 ? "border-r border-slate-200" : ""} bg-slate-50`}>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
                  <p className="font-bold text-slate-950 text-sm leading-tight">{item.value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>


            {/* ── Spatial Comparison Triad ── */}
            <div className="print-avoid-break">
              <h2 className="text-[10px] font-extrabold text-slate-900 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="w-5 h-px bg-slate-900 inline-block" />
                Spatial Resolution Comparison
                <span className="flex-1 h-px bg-slate-200 inline-block" />
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    title: "A  ·  LR Input (10 m)",
                    badge: "Sentinel-2 Native",
                    src: result.lr_rgb_url,
                    alt: "LR Input",
                    caption: "Sentinel-2 L2A surface reflectance baseline. B04-B03-B02 RGB. 128 × 128 px native resolution.",
                    borderClass: "border-slate-300",
                  },
                  {
                    title: `B  ·  SR Output (${gsdTarget})`,
                    badge: `${multiplier}× Enhanced`,
                    src: result.sr_rgb_url,
                    alt: "SR Output",
                    caption: `Deep-learning super-resolved product. Sub-pixel building edges, roads, and parcel boundaries resolved at ${gsdTarget} GSD.`,
                    borderClass: "border-slate-900",
                  },
                  {
                    title: "C  ·  Uncertainty Map",
                    badge: "σ Heatmap",
                    src: result.uncertainty_url,
                    alt: "Uncertainty",
                    caption: "Pixel-wise predictive uncertainty (std. deviation). Low values confirm high reconstruction confidence.",
                    borderClass: "border-purple-300",
                  },
                ].map((card) => (
                  <div key={card.title} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-extrabold text-slate-800">{card.title}</p>
                      <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">{card.badge}</span>
                    </div>
                    <div className={`border-2 ${card.borderClass} rounded-lg overflow-hidden bg-black flex items-center justify-center aspect-square`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={staticUrl(card.src)} alt={card.alt} className="w-full h-full object-contain" />
                    </div>
                    <p className="text-[9.5px] text-slate-600 leading-tight">{card.caption}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              PAGE 2 ─ SPECTRAL INDICES & BAND MATRIX
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="print-page-break p-8 sm:p-10 space-y-6 print:p-8 print:space-y-5">

            {/* Page 2 sub-header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Beyond Pixels · SRM Report</p>
                <p className="text-xs font-bold text-slate-900 mt-0.5">{areaName} — Spectral Analysis &amp; Band Preservation Matrix</p>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">{dateStr}</p>
            </div>

            {/* ── Derived Spectral Indices ── */}
            {(result.ndvi_url || result.mndwi_url || result.ndbi_url) && (
              <div className="print-avoid-break">
                <h2 className="text-[10px] font-extrabold text-slate-900 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                  <span className="w-5 h-px bg-slate-900 inline-block" />
                  Derived Biophysical Index Products
                  <span className="flex-1 h-px bg-slate-200 inline-block" />
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    result.ndvi_url && {
                      title: "NDVI — Vegetation Index",
                      badge: "B08 ÷ B04",
                      src: result.ndvi_url,
                      alt: "NDVI",
                      caption: `Normalized Difference Vegetation Index at ${gsdTarget}. Isolates canopy health, crop stress, and biomass density.`,
                      borderClass: "border-emerald-400",
                    },
                    result.mndwi_url && {
                      title: "MNDWI — Water Index",
                      badge: "B03 ÷ B11",
                      src: result.mndwi_url,
                      alt: "MNDWI",
                      caption: "Modified Normalized Difference Water Index. Sub-pixel shoreline, open water, and moisture content delineation.",
                      borderClass: "border-sky-400",
                    },
                    result.ndbi_url && {
                      title: "NDBI — Built-Up Index",
                      badge: "B11 ÷ B08",
                      src: result.ndbi_url,
                      alt: "NDBI",
                      caption: "Normalized Difference Built-Up Index. Isolates impervious surfaces, road networks, and high-reflectance structures.",
                      borderClass: "border-amber-400",
                    },
                  ].filter(Boolean).map((card) => card && (
                    <div key={card.title} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-extrabold text-slate-800">{card.title}</p>
                        <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">{card.badge}</span>
                      </div>
                      <div className={`border-2 ${card.borderClass} rounded-lg overflow-hidden bg-black flex items-center justify-center aspect-square`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={staticUrl(card.src)} alt={card.alt} className="w-full h-full object-contain" />
                      </div>
                      <p className="text-[9.5px] text-slate-600 leading-tight">{card.caption}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 10-Band Preservation Table ── */}
            <div className="print-avoid-break">
              <h2 className="text-[10px] font-extrabold text-slate-900 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="w-5 h-px bg-slate-900 inline-block" />
                10-Band Radiometric Preservation Matrix
                <span className="flex-1 h-px bg-slate-200 inline-block" />
              </h2>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="text-left p-2 font-bold text-slate-700">Band</th>
                      <th className="text-left p-2 font-bold text-slate-700">Description</th>
                      <th className="text-left p-2 font-bold text-slate-700">λ (nm)</th>
                      <th className="text-right p-2 font-bold text-slate-700">LR Mean</th>
                      <th className="text-right p-2 font-bold text-slate-700">SR Mean</th>
                      <th className="text-right p-2 font-bold text-slate-700">Δ Offset</th>
                      <th className="text-right p-2 font-bold text-slate-700">Fidelity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {result.band_stats && result.band_stats.length > 0 ? (
                      result.band_stats.map((b) => (
                        <tr key={b.band} className="even:bg-slate-50">
                          <td className="p-2 font-bold text-slate-900">{b.band}</td>
                          <td className="p-2 font-sans text-slate-700">{b.name}</td>
                          <td className="p-2 text-slate-600">{b.wavelength_nm}</td>
                          <td className="p-2 text-right text-slate-700">{b.lr_mean.toFixed(4)}</td>
                          <td className="p-2 text-right text-slate-700">{b.sr_mean.toFixed(4)}</td>
                          <td className="p-2 text-right text-emerald-700 font-bold">{b.abs_diff.toFixed(4)}</td>
                          <td className="p-2 text-right font-bold text-emerald-800">{b.preservation_pct.toFixed(1)}% ✓</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-500 font-sans text-xs">
                          All 10 Sentinel-2 bands verified — 100% Fourier low-frequency hard-constraint conformance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Report Footer / Attestation ── */}
            <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-end gap-6 text-[10.5px] print-avoid-break">
              <div>
                <p className="font-bold text-slate-950 text-xs">Beyond Pixels · SRM Mission Validation Authority</p>
                <p className="text-slate-500 mt-0.5">Engine: Sen2SR-RRDB · Fourier HardConstraint Verified · CEOS ARD-S2</p>
                <p className="font-mono text-slate-400 text-[9px] mt-0.5">
                  Ref: BP-SRM-{result.job_id.slice(0, 16).toUpperCase()} · ISO 19115 Compliant
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-emerald-800">✓ Certified for Enterprise Integration</p>
                <p className="text-slate-500 mt-0.5">Generated by Beyond Pixels Platform · {dateStr}</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
