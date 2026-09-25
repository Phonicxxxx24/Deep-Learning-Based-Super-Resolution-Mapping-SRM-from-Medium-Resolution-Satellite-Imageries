"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Map,
  Layers,
  Clock,
  FileDown,
  FileText,
  Maximize2,
  Sliders,
  Zap,
  Waves,
  Scale,
  Cpu,
  ArrowUpRight,
} from "lucide-react";

import LiquidBackdrop from "./LiquidBackdrop";
import BeforeAfterSlider from "./BeforeAfterSlider";
import SpectralFidelityGraphs from "./SpectralFidelityGraphs";
import ImageMaximizeModal, { type MaximizeImageData } from "./ImageMaximizeModal";
import ExecutiveReportModal from "./ExecutiveReportModal";
import {
  Satellite3DIcon,
  SpectralPrismIcon,
  RadarReticleIcon,
} from "./GlobalIcons";
import type { SRResult } from "@/types";
import { staticUrl } from "@/utils/api";

type IndexTab = "ndvi" | "mndwi" | "ndbi";

const INDEX_CONFIG: Record<
  IndexTab,
  {
    label: string;
    fullName: string;
    desc: string;
    srKey: keyof SRResult;
    lrKey: keyof SRResult;
    cmapNote: string;
    cmapName: string;
    gradientClass: string;
    colorScaleGradient: string;
    lowLabel: string;
    midLabel: string;
    highLabel: string;
    biophysicalRole: string;
  }
> = {
  ndvi: {
    label: "NDVI",
    fullName: "Normalized Difference Vegetation Index",
    desc: "(NIR - Red) / (NIR + Red)",
    srKey: "ndvi_url",
    lrKey: "lr_ndvi_url",
    cmapNote: "Green = dense vegetation canopy, Yellow = sparse scrub, Red = bare soil / urban",
    cmapName: "RdYlGn (Calibrated Dynamic Range)",
    gradientClass: "bg-gradient-to-r from-[#a50026] via-[#ffffbf] to-[#006837]",
    colorScaleGradient: "linear-gradient(to right, #a50026, #ffffbf, #006837)",
    lowLabel: "Low [-0.2 to 0.1] Soil/Pavement",
    midLabel: "Moderate [0.2 to 0.4] Grassland",
    highLabel: "Dense Canopy [> 0.5] Forest",
    biophysicalRole: "Isolates photosynthetic chlorophyll activity and differentiates vegetative vigor from barren terrain.",
  },
  mndwi: {
    label: "MNDWI",
    fullName: "Modified Normalized Difference Water Index",
    desc: "(Green - SWIR1) / (Green + SWIR1)",
    srKey: "mndwi_url",
    lrKey: "lr_mndwi_url",
    cmapNote: "Deep Blue = open water bodies / reservoirs, Light Green/White = non-water",
    cmapName: "YlGnBu (Water Surface High-Pass)",
    gradientClass: "bg-gradient-to-r from-[#ffffd9] via-[#41b6c4] to-[#081d58]",
    colorScaleGradient: "linear-gradient(to right, #ffffd9, #41b6c4, #081d58)",
    lowLabel: "Dry Land [-0.4] Non-Water",
    midLabel: "Moist Soil / Wetland [0.0]",
    highLabel: "Open Deep Water [+0.6]",
    biophysicalRole: "Enhances surface water features while effectively suppressing false positive built-up noise.",
  },
  ndbi: {
    label: "NDBI",
    fullName: "Normalized Difference Built-up Index",
    desc: "(SWIR1 - NIR) / (SWIR1 + NIR)",
    srKey: "ndbi_url",
    lrKey: "lr_ndbi_url",
    cmapNote: "Yellow/Bright = dense urban & impervious roofs, Dark/Violet = non-urban",
    cmapName: "Plasma (Urban Built-up High-Contrast)",
    gradientClass: "bg-gradient-to-r from-[#0d0887] via-[#cc4778] to-[#f0f921]",
    colorScaleGradient: "linear-gradient(to right, #0d0887, #cc4778, #f0f921)",
    lowLabel: "Vegetation/Water [-0.4]",
    midLabel: "Mixed Transition [0.0]",
    highLabel: "Impervious Built-up [+0.6]",
    biophysicalRole: "Delineates urban density, concrete structures, road networks, and artificial surfaces.",
  },
};


function CompareImageCard({
  label,
  src,
  badge,
  subtext,
  onMaximize,
}: {
  label: string;
  src: string;
  badge: string;
  subtext?: string;
  onMaximize?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
      className="rounded-[30px] ios-glass-card border border-white/15 text-white shadow-2xl flex flex-col overflow-hidden group hover:border-white/35 transition-all duration-300 relative"
    >
      {/* Specular top rim shine */}
      <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-20" />

      <div
        className="relative w-full aspect-square bg-black/70 overflow-hidden cursor-pointer"
        onClick={onMaximize}
      >
        <Image
          src={staticUrl(src)}
          alt={label}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover group-hover:scale-106 transition-transform duration-700 ease-[0.16,1,0.3,1]"
          unoptimized
        />
        <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full text-[11px] font-mono font-medium bg-black/75 backdrop-blur-xl text-white border border-white/20 shadow-lg tabular-nums">
          {badge}
        </div>

        {/* Maximize Button Overlay */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMaximize?.();
          }}
          title="Maximize in full lossless resolution"
          className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-xl border border-white/25 shadow-xl opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10 active:scale-95"
        >
          <Maximize2 size={11} />
          <span>Maximize</span>
        </button>
      </div>
      <div className="p-4 bg-white/[0.03] backdrop-blur-xl border-t border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-white tracking-tight font-mono">{label}</h3>
          {subtext && <p className="text-[11px] text-white/60 mt-0.5 font-mono">{subtext}</p>}
        </div>
        <button
          type="button"
          onClick={onMaximize}
          title="Maximize image"
          className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer shrink-0 active:scale-90 border border-transparent hover:border-white/15"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </motion.div>
  );
}

export default function ResultsPanel({ result }: { result: SRResult }) {
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [indexTab, setIndexTab] = useState<IndexTab>("ndvi");
  const [viewMode, setViewMode] = useState<"split" | "before" | "after">("split");
  const [maximizeImage, setMaximizeImage] = useState<MaximizeImageData | null>(null);

  const scaleFactor = result.scale_factor ?? 4;
  const resStr = result.sr_resolution_m ? `${result.sr_resolution_m}m` : (scaleFactor === 8 ? "0.625m" : "2.5m");


  const srTifUrl = staticUrl(`/static/${result.job_id}_sr_10band_${resStr}.tif`);
  const uncTifUrl = staticUrl(`/static/${result.job_id}_uncertainty_${resStr}.tif`);

  const meanPreservation =
    result.band_stats && result.band_stats.length > 0
      ? (
          result.band_stats.reduce((acc, s) => acc + s.preservation_pct, 0) /
          result.band_stats.length
        ).toFixed(1)
      : null;



  return (
    <div
      className="relative min-h-screen p-4 sm:p-6 lg:px-8 flex flex-col gap-6 w-full max-w-none font-mono text-white print:p-0 print:m-0 print:min-h-0 print:bg-white print:text-black print:overflow-visible"
      style={{
        backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url('/results-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#06080e",
      }}
    >
      {/* Fixed High-Visibility Satellite Background Layer */}
      <div
        className="fixed inset-0 z-0 pointer-events-none print:hidden bg-cover bg-no-repeat"
        style={{
          backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url('/results-bg.jpg')",
          backgroundPosition: "center top",
          backgroundAttachment: "fixed",
        }}
      />

      {/* ── Main Interactive Screen Content ── */}
      <div className="relative z-10 flex flex-col gap-6 w-full print:hidden">
      {/* ── Ultra-Luxury Top Command Bar ── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="ios-glass-card rounded-[28px] sm:rounded-[32px] border border-white/15 p-4 lg:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative overflow-hidden shadow-2xl"
      >
        {/* Ambient Top Luminous Rim */}
        <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap min-w-0">
          <Link
            href="/"
            className="group flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/12 hover:border-white/25 transition-all cursor-pointer font-sans shrink-0 shadow-sm active:scale-95"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Satellite Map</span>
          </Link>

          <div className="w-px h-8 bg-gradient-to-b from-transparent via-white/15 to-transparent hidden sm:block shrink-0" />

          {/* Luxury Brand Emblem Housing */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-12 h-12 shrink-0 filter drop-shadow-[0_2px_12px_rgba(255,255,255,0.25)]">
              <Image
                src="/beyond-pixels-logo.png"
                alt="Beyond Pixels Emblem"
                fill
                className="object-contain"
                priority
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight font-sans truncate">
                {scaleFactor === 8 ? "8× Sub-Meter Spatial Resolution (0.625m GSD)" : "4× Super-Resolution Mapping (2.5m GSD)"}
              </h1>
            </div>
          </div>
        </div>

        {/* Right Telemetry & Actions Cluster */}
        <div className="flex items-center gap-2 flex-wrap text-xs shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono tabular-nums text-white/80 text-xs backdrop-blur-md">
            <Clock size={12} className="text-white/50" />
            <span>{result.processing_time_s.toFixed(1)}s Runtime</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono tabular-nums text-white/80 text-xs hidden sm:flex backdrop-blur-md">
            <Layers size={12} className="text-white/50" />
            <span>{scaleFactor === 8 ? "0.625m Res" : "2.5m Res"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono tabular-nums text-white font-semibold text-xs backdrop-blur-md">
            <Cpu size={12} className="text-white/70" />
            <span>{result.sampling_steps_used ? `${result.sampling_steps_used} Passes` : "Neural Synthesis"}</span>
          </div>

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="ios-btn-primary flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-100 font-bold text-xs transition-all shadow-lg shadow-white/10 cursor-pointer active:scale-95 font-sans shrink-0 ml-1"
            title="Download or print dedicated Executive PDF Report"
          >
            <FileText size={13} className="text-black" />
            <span>PDF Intelligence Report</span>
            <ArrowUpRight size={13} className="text-black/60" />
          </button>
        </div>
      </motion.header>

      {/* ── Spatial Comparison Cards ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-3 font-mono"
      >
        <div className="ios-glass-card rounded-[26px] p-4 sm:p-5 border border-white/15 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/10 text-white flex items-center justify-center border border-white/15 shadow-inner shrink-0">
              <Map size={17} />
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider drop-shadow-sm">
              High-Fidelity Spatial Triad Comparison
            </h2>
          </div>
          <span className="text-xs text-white font-mono px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md self-start sm:self-auto font-semibold shadow-sm">
            Ground Footprint: 1.28 km × 1.28 km
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CompareImageCard
            label="Sentinel-2 L2A Input"
            src={result.lr_rgb_url}
            badge={`${result.patch_size_px}px @ ${result.lr_resolution_m}m`}
            subtext="B04-B03-B02 true color (bicubic 4× display)"
            onMaximize={() =>
              setMaximizeImage({
                title: "Sentinel-2 L2A Input (10m Resolution)",
                src: result.lr_rgb_url,
                badge: "10m Baseline S2",
                resolution: `Ground Sampling Distance: ${result.lr_resolution_m}m`,
                dimensions: `${result.patch_size_px} × ${result.patch_size_px} px (Original BOA)`,
                subtext: "Surface reflectance RGB composite (B04-Red, B03-Green, B02-Blue) directly from Copernicus Sentinel-2.",
              })
            }
          />
          <CompareImageCard
            label={`Super-Resolved Product (${resStr})`}
            src={result.sr_rgb_url}
            badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
            subtext={`${scaleFactor}× Enhanced SRM Product`}
            onMaximize={() =>
              setMaximizeImage({
                title: `Super-Resolved Product (${result.sr_resolution_m}m Resolution)`,
                src: result.sr_rgb_url,
                badge: `${result.sr_resolution_m}m Super-Resolved`,
                resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m`,
                dimensions: `${result.output_size_px} × ${result.output_size_px} px (Uncompressed)`,
                subtext: "Super-resolved BOA reflectance composite with Fourier low-pass phase invariance.",
              })
            }
          />
          {result.uncertainty_url ? (
            <CompareImageCard
              label="Per-Pixel Epistemic Uncertainty"
              src={result.uncertainty_url}
              badge="Std dev across passes"
              subtext="Plasma map (brighter = higher uncertainty)"
              onMaximize={() =>
                setMaximizeImage({
                  title: "Per-Pixel Epistemic Uncertainty Map",
                  src: result.uncertainty_url,
                  badge: "Monte-Carlo Uncertainty",
                  resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m`,
                  dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                  subtext: "Stochastic standard deviation across sampling steps.",
                  colorScale: {
                    gradient: "linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)",
                    minLabel: "0.0 (High Confidence)",
                    maxLabel: "Max (Epistemic Dispersion)",
                  },
                })
              }
            />
          ) : (
            <div className="rounded-[30px] ios-glass-card border border-white/12 flex items-center justify-center p-8 text-xs text-center text-white/50 backdrop-blur-xl">
              Uncertainty map not generated for this run
            </div>
          )}
        </div>
      </motion.section>

      {/* ── Interactive Before/After Resolution Slider ── */}
      <section className="space-y-3">
        <BeforeAfterSlider
            beforeSrc={result.lr_rgb_url}
            afterSrc={result.sr_rgb_url}
            beforeLabel="Sentinel-2 L2A Input"
            afterLabel="Sen2SR-RRDB Super-Resolved"
            beforeBadge={`${result.patch_size_px}px @ ${result.lr_resolution_m}m`}
            afterBadge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
            beforeResolution={`Ground Sampling Distance: ${result.lr_resolution_m}m Baseline`}
            afterResolution={`Ground Sampling Distance: ${result.sr_resolution_m}m (${scaleFactor === 8 ? "8× Sub-Meter" : "4× Super-Resolved"})`}
            footprint="1.28 km × 1.28 km Ground Footprint"
            onMaximizeBefore={() =>
              setMaximizeImage({
                title: "Sentinel-2 L2A Input (10m Resolution)",
                src: result.lr_rgb_url,
                badge: "10m Baseline S2",
                resolution: `Ground Sampling Distance: ${result.lr_resolution_m}m`,
                dimensions: `${result.patch_size_px} × ${result.patch_size_px} px (Original BOA)`,
                subtext: "Surface reflectance RGB composite (B04-Red, B03-Green, B02-Blue) directly from Copernicus Sentinel-2.",
              })
            }
            onMaximizeAfter={() =>
              setMaximizeImage({
                title: `Sen2SR-RRDB SRM (${result.sr_resolution_m}m Resolution)`,
                src: result.sr_rgb_url,
                badge: `${result.sr_resolution_m}m Super-Resolved`,
                resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m`,
                dimensions: `${result.output_size_px} × ${result.output_size_px} px (Uncompressed)`,
                subtext: "Super-resolved BOA reflectance composite with Fourier low-pass phase invariance.",
              })
            }
          />
      </section>

      {/* ── 10-Band Radiometric Fidelity & Interactive Vector Graphs ── */}
      <SpectralFidelityGraphs
        bandStats={result.band_stats}
        meanPreservation={meanPreservation}
        srResolutionM={result.sr_resolution_m || 2.5}
        outputSizePx={result.output_size_px || 512}
      />


      {/* ── GeoTIFF Downloads ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="ios-glass-card rounded-[28px] p-5 sm:p-6 border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xl backdrop-blur-xl font-mono relative overflow-hidden group"
      >
        {/* Specular top rim shine */}
        <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-white/10 text-white flex items-center justify-center border border-white/15 backdrop-blur-md shadow-inner shrink-0">
            <FileDown size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Enterprise GeoTIFF Deliverables
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/10 text-white border border-white/15 font-semibold">
                32-Bit Float
              </span>
            </div>
            <p className="text-xs text-white/60 mt-0.5">
              Download calibrated 32-bit float GeoTIFFs georeferenced in Sentinel-2 UTM coordinate reference system.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href={srTifUrl}
            download
            className="ios-btn-primary flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer bg-white text-black hover:bg-neutral-100 shadow-lg shadow-white/10 active:scale-95 font-sans"
          >
            <FileDown size={14} />
            <span>10-Band SR GeoTIFF ({resStr})</span>
          </a>
          <a
            href={uncTifUrl}
            download
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer bg-white/10 hover:bg-white/20 text-white border border-white/15 shadow-sm active:scale-95 backdrop-blur-md font-sans"
          >
            <Download size={14} />
            <span>Uncertainty GeoTIFF</span>
          </a>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer bg-white/10 hover:bg-white/20 text-white border border-white/15 shadow-sm active:scale-95 backdrop-blur-md font-sans"
            title="Open Dedicated Executive PDF Report"
          >
            <FileText size={14} />
            <span>Executive PDF Report</span>
          </button>
        </div>
      </motion.section>

      {/* ── Spectral Indices ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-4 font-mono"
      >
        <div className="ios-glass-card rounded-[28px] p-4 sm:p-5 border border-white/15 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/10 text-white flex items-center justify-center border border-white/15 shadow-inner shrink-0">
              <Layers size={17} />
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider drop-shadow-sm">
              Derived Spectral Indices (Before 10m &amp; After {resStr})
            </h2>
          </div>
        </div>

        {/* Tab & View Mode Switcher Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
          {/* Index Tabs with iOS Sliding Capsule */}
          <div className="flex items-center p-1 rounded-2xl bg-white/[0.05] border border-white/12 backdrop-blur-xl gap-1 flex-wrap">
            {(Object.keys(INDEX_CONFIG) as IndexTab[]).map((tab) => {
              const isSel = indexTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setIndexTab(tab)}
                  className={`relative px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer font-mono active:scale-95 ${
                    isSel ? "text-black font-bold shadow-md" : "text-white/70 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  {isSel && (
                    <motion.div
                      layoutId="activeIndicesTab"
                      className="absolute inset-0 bg-white rounded-xl"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <span>{INDEX_CONFIG[tab].label}</span>
                    <span className={`text-[11px] font-normal ${isSel ? "text-black/70" : "text-white/40"}`}>
                      — {INDEX_CONFIG[tab].desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* View Mode Switcher with iOS Sliding Capsule */}
          <div className="flex items-center p-1 rounded-xl bg-white/[0.05] border border-white/12 backdrop-blur-xl gap-1">
            {[
              { id: "split", label: "Side-by-Side" },
              { id: "before", label: "Before (10m)" },
              { id: "after", label: `After (${resStr})` },
            ].map(({ id, label }) => {
              const isSel = viewMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id as "split" | "before" | "after")}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer font-mono active:scale-95 ${
                    isSel ? "text-black font-bold shadow-sm" : "text-white/70 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  {isSel && (
                    <motion.div
                      layoutId="activeViewMode"
                      className="absolute inset-0 bg-white rounded-lg"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Index Viewer Cards & Legend (Full frame scaled to 0.80x, no inside nested frame) */}
        <div className="w-full max-w-[80%] mx-auto space-y-4">
          {viewMode === "split" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Card: Before (10m Native Sentinel-2) */}
              <motion.div
                whileHover={{ y: -3, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
                className="ios-glass-card rounded-[30px] border border-white/15 text-white shadow-2xl flex flex-col overflow-hidden group hover:border-white/35 transition-all duration-300 relative"
              >
                {/* Specular top rim shine */}
                <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-20" />

                <div className="px-4 py-3.5 flex items-center justify-between bg-white/[0.04] border-b border-white/10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white/60" />
                    <h3 className="text-xs font-bold text-white font-mono">
                      Before: {INDEX_CONFIG[indexTab].label} @ 10m Ground Resolution
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-semibold bg-white/10 text-white border border-white/15 backdrop-blur-md">
                    Native S2 (10m)
                  </span>
                </div>

                {/* Direct image frame filling the card width */}
                <div className="relative w-full aspect-square bg-black/80 overflow-hidden">
                  {result[INDEX_CONFIG[indexTab].lrKey] || result[INDEX_CONFIG[indexTab].srKey] ? (
                    <>
                      <Image
                        src={staticUrl((result[INDEX_CONFIG[indexTab].lrKey] || result[INDEX_CONFIG[indexTab].srKey]) as string)}
                        alt={`${INDEX_CONFIG[indexTab].label} 10m LR`}
                        fill
                        sizes="(max-width: 768px) 100vw, 40vw"
                        className="object-contain group-hover:scale-105 transition-transform duration-700 ease-[0.16,1,0.3,1]"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cfg = INDEX_CONFIG[indexTab];
                          setMaximizeImage({
                            title: `Before: ${cfg.label} @ 10m Ground Resolution — ${cfg.fullName}`,
                            src: (result[cfg.lrKey] || result[cfg.srKey]) as string,
                            badge: "10m Native Baseline",
                            resolution: "Ground Sampling Distance: 10m (Sentinel-2 L2A)",
                            dimensions: `${result.patch_size_px} × ${result.patch_size_px} px`,
                            subtext: `Coarse 10m native spatial pixelation. Calibrated dynamic scale identical to 2.5m SR.`,
                            colorScale: {
                              gradient: cfg.colorScaleGradient,
                              minLabel: cfg.lowLabel,
                              maxLabel: cfg.highLabel,
                            },
                          });
                        }}
                        title="Maximize Before index map in full resolution"
                        className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-xl border border-white/25 shadow-xl opacity-90 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10 active:scale-95"
                      >
                        <Maximize2 size={12} />
                        <span>Maximize</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-white/50">
                      10m index map loading…
                    </div>
                  )}
                </div>

                <div className="px-4 py-2.5 text-[11px] text-white/60 bg-white/[0.02] border-t border-white/10 font-mono">
                  Coarse 10m grid showing native satellite spatial pixelation.
                </div>
              </motion.div>

              {/* Right Card: After (2.5m Super-Resolved SRM) */}
              <motion.div
                whileHover={{ y: -3, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
                className="ios-glass-card rounded-[30px] border border-white/15 text-white shadow-2xl flex flex-col overflow-hidden group hover:border-white/35 transition-all duration-300 relative"
              >
                {/* Specular top rim shine */}
                <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-20" />

                <div className="px-4 py-3.5 flex items-center justify-between bg-white/[0.04] border-b border-white/10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <h3 className="text-xs font-bold text-white font-mono">
                      After: {INDEX_CONFIG[indexTab].label} @ {resStr} Super-Resolved
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold bg-white text-black shadow-xs">
                    {scaleFactor === 8 ? "8× Sub-Metre" : "4× Super-Resolved"}
                  </span>
                </div>

                {/* Direct image frame filling the card width */}
                <div className="relative w-full aspect-square bg-black/80 overflow-hidden">
                  {result[INDEX_CONFIG[indexTab].srKey] ? (
                    <>
                      <Image
                        src={staticUrl(result[INDEX_CONFIG[indexTab].srKey] as string)}
                        alt={`${INDEX_CONFIG[indexTab].label} SR`}
                        fill
                        sizes="(max-width: 768px) 100vw, 40vw"
                        className="object-contain group-hover:scale-105 transition-transform duration-700 ease-[0.16,1,0.3,1]"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cfg = INDEX_CONFIG[indexTab];
                          setMaximizeImage({
                            title: `After: ${cfg.label} @ ${resStr} Super-Resolved — ${cfg.fullName}`,
                            src: result[cfg.srKey] as string,
                            badge: `${resStr} Super-Resolved`,
                            resolution: `Ground Sampling Distance: ${resStr}`,
                            dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                            subtext: `Sharp, continuous biophysical boundaries resolved without pixelation.`,
                            colorScale: {
                              gradient: cfg.colorScaleGradient,
                              minLabel: cfg.lowLabel,
                              maxLabel: cfg.highLabel,
                            },
                          });
                        }}
                        title="Maximize After index map in full resolution"
                        className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-xl border border-white/25 shadow-xl opacity-90 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10 active:scale-95"
                      >
                        <Maximize2 size={12} />
                        <span>Maximize</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-white/50">
                      Super-resolved index map loading…
                    </div>
                  )}
                </div>

                <div className="px-4 py-2.5 text-[11px] text-white font-medium bg-white/[0.02] border-t border-white/10 font-mono">
                  Sharp, continuous biophysical boundaries resolved without pixelation.
                </div>
              </motion.div>
            </div>
          ) : (
            /* Single View */
            <motion.div
              whileHover={{ y: -3, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
              className="ios-glass-card rounded-[30px] border border-white/15 text-white shadow-2xl flex flex-col overflow-hidden group hover:border-white/35 transition-all duration-300 relative"
            >
              {/* Specular top rim shine */}
              <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-20" />

              <div className="px-4 py-3.5 flex items-center justify-between bg-white/[0.04] border-b border-white/10 backdrop-blur-md">
                <div>
                  <h3 className="text-xs font-bold text-white font-mono">
                    {viewMode === "before" ? "Before: Native 10m Input" : `After: ${resStr} Super-Resolved`} — {INDEX_CONFIG[indexTab].fullName}
                  </h3>
                  <p className="text-[11px] text-white/60 mt-0.5 font-mono">{INDEX_CONFIG[indexTab].desc}</p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold bg-white text-black shadow-xs">
                  {viewMode === "before" ? "10m Resolution (Native LR)" : `${resStr} Resolution (Enhanced SR)`}
                </span>
              </div>

              {/* Direct panoramic image frame filling the card width */}
              <div className="relative w-full aspect-[2/1] sm:aspect-[21/9] bg-black/80 overflow-hidden">
                <Image
                  src={staticUrl(
                    (viewMode === "before"
                      ? result[INDEX_CONFIG[indexTab].lrKey] || result[INDEX_CONFIG[indexTab].srKey]
                      : result[INDEX_CONFIG[indexTab].srKey]) as string
                  )}
                  alt={INDEX_CONFIG[indexTab].label}
                  fill
                  className="object-contain group-hover:scale-105 transition-transform duration-700 ease-[0.16,1,0.3,1]"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => {
                    const cfg = INDEX_CONFIG[indexTab];
                    setMaximizeImage({
                      title: `${viewMode === "before" ? "Before (10m)" : `After (${resStr})`}: ${cfg.label} — ${cfg.fullName}`,
                      src: (viewMode === "before"
                        ? result[cfg.lrKey] || result[cfg.srKey]
                        : result[cfg.srKey]) as string,
                      badge: viewMode === "before" ? "10m Native Baseline" : `${resStr} Super-Resolved`,
                      resolution: viewMode === "before" ? "Ground Sampling Distance: 10m" : `Ground Sampling Distance: ${resStr}`,
                      dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                      subtext: cfg.cmapNote,
                      colorScale: {
                        gradient: cfg.colorScaleGradient,
                        minLabel: cfg.lowLabel,
                        maxLabel: cfg.highLabel,
                      },
                    });
                  }}
                  title="Maximize in full resolution"
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-xl border border-white/25 shadow-xl opacity-90 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-10 active:scale-95"
                >
                  <Maximize2 size={13} />
                  <span>Maximize</span>
                </button>
              </div>

              <div className="px-4 py-3 text-xs flex items-center justify-between bg-white/[0.02] border-t border-white/10 font-mono">
                <span>
                  <strong className="text-white">{INDEX_CONFIG[indexTab].label}</strong>: {INDEX_CONFIG[indexTab].desc}
                </span>
                <span className="text-[11px] text-white/60">{INDEX_CONFIG[indexTab].cmapNote}</span>
              </div>
            </motion.div>
          )}

          {/* ── High-Visibility Scale Legend Bar ── */}
          <div className="ios-glass-card rounded-[28px] p-5 border border-white/15 space-y-3.5 shadow-2xl backdrop-blur-xl font-mono relative overflow-hidden">
            {/* Specular top rim shine */}
            <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sliders size={13} className="text-white" />
                <span>Radiometric Color Scale &amp; Dynamic Class Legend ({INDEX_CONFIG[indexTab].cmapName})</span>
              </span>
              <span className="text-[11px] text-white/60 font-mono">
                Calibrated Dynamic Range (Shared LR/SR Scale)
              </span>
            </div>

            {/* Continuous Gradient Bar */}
            <div className="space-y-1.5">
              <div className={`h-4 w-full rounded-full ${INDEX_CONFIG[indexTab].gradientClass} shadow-inner border border-white/20`} />
              <div className="flex justify-between text-[11px] text-white/70 font-medium font-mono px-1 tabular-nums">
                <span>◀ {INDEX_CONFIG[indexTab].lowLabel}</span>
                <span className="text-center font-semibold text-white">{INDEX_CONFIG[indexTab].midLabel}</span>
                <span className="text-right">{INDEX_CONFIG[indexTab].highLabel} ▶</span>
              </div>
            </div>

            {/* Biophysical context note */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-white/60 gap-1 border-t border-white/10">
              <span>
                <strong className="text-white">Biophysical Function:</strong> {INDEX_CONFIG[indexTab].biophysicalRole}
              </span>
              <span className="font-mono text-white font-semibold">
                Both LR &amp; SR calibrated to identical dynamic range
              </span>
            </div>
          </div>
        </div>
      </motion.section>
      </div>

      {/* ── High-Resolution Lossless Maximize Lightbox Modal ── */}
      <ImageMaximizeModal
        image={maximizeImage}
        onClose={() => setMaximizeImage(null)}
      />

      {/* ── Executive Report & STAC Export Modal ── */}
      <ExecutiveReportModal
        result={result}
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        scaleFactor={scaleFactor}
      />
    </div>
  );
}
