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
  AlertCircle,
  Clock,
  Sparkles,
  FileDown,
  FileText,
  ExternalLink,
  Maximize2,
  Sliders,
  Zap,
  Waves,
  Scale,
  Cpu,
} from "lucide-react";

import LiquidBackdrop from "./LiquidBackdrop";
import Card3D from "./Card3D";
import BeforeAfterSlider from "./BeforeAfterSlider";
import SpectralFidelityGraphs from "./SpectralFidelityGraphs";
import ImageMaximizeModal, { type MaximizeImageData } from "./ImageMaximizeModal";
import ExecutiveReportModal from "./ExecutiveReportModal";
import {
  Satellite3DIcon,
  SpectralPrismIcon,
  RadarReticleIcon,
  LiquidWaveIcon,
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
    <div className="rounded-2xl border border-[#1f1f1f] bg-[#0c0c0c] text-white shadow-sm flex flex-col overflow-hidden group hover:border-[#333] transition-all">
      <div
        className="relative w-full aspect-square bg-[#050505] overflow-hidden cursor-pointer"
        onClick={onMaximize}
      >
        <Image
          src={staticUrl(src)}
          alt={label}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover group-hover:scale-102 transition-transform duration-300 ease-out"
          unoptimized
        />
        <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-black/85 backdrop-blur-md text-white border border-white/10 shadow-sm tabular-nums">
          {badge}
        </div>

        {/* Maximize Button Overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMaximize?.();
          }}
          title="Maximize in full lossless resolution"
          className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-black text-white backdrop-blur-md border border-white/15 shadow-md opacity-90 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10"
        >
          <Maximize2 size={12} />
          <span>Maximize</span>
        </button>
      </div>
      <div className="p-3.5 bg-[#0e0e0e] border-t border-[#1f1f1f] flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-white">{label}</h3>
          {subtext && <p className="text-[11px] text-[#888] mt-0.5">{subtext}</p>}
        </div>
        <button
          onClick={onMaximize}
          title="Maximize image"
          className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-[#888] hover:text-white transition-all cursor-pointer shrink-0"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ResultsPanel({ result }: { result: SRResult }) {
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [indexTab, setIndexTab] = useState<IndexTab>("ndvi");
  const [viewMode, setViewMode] = useState<"split" | "before" | "after">("split");
  const [maximizeImage, setMaximizeImage] = useState<MaximizeImageData | null>(null);

  const scaleFactor = result.scale_factor ?? 4;
  const resStr = result.sr_resolution_m ? `${result.sr_resolution_m}m` : (scaleFactor === 8 ? "0.625m" : "2.5m");

  const hasBothModels = false;
  const [sliderMode] = useState<"input_vs_sr">("input_vs_sr");

  const srTifUrl = staticUrl(`/static/${result.job_id}_sr_10band_${resStr}.tif`);
  const uncTifUrl = staticUrl(`/static/${result.job_id}_uncertainty_${resStr}.tif`);

  const meanPreservation =
    result.band_stats && result.band_stats.length > 0
      ? (
          result.band_stats.reduce((acc, s) => acc + s.preservation_pct, 0) /
          result.band_stats.length
        ).toFixed(1)
      : null;

  const meanPreservationAble =
    result.band_stats_able && result.band_stats_able.length > 0
      ? (
          result.band_stats_able.reduce((acc, s) => acc + s.preservation_pct, 0) /
          result.band_stats_able.length
        ).toFixed(1)
      : null;


  return (
    <div className="relative min-h-screen p-4 sm:p-6 lg:px-8 flex flex-col gap-6 w-full max-w-none font-mono text-white" style={{ background: "#000000" }}>
      {/* Liquid Organic Mesh Background */}
      <LiquidBackdrop />

      {/* ── Top Command Bar ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0a0a0a] border border-[#1f1f1f] shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] text-white border border-[#2a2a2a] transition-all cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to 3D Globe
          </Link>
          <div className="w-px h-6 bg-[#222]" />
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-black shrink-0 border border-[#2a2a2a]">
              <Image
                src="/beyond-pixels-icon.png"
                alt="Beyond Pixels Logo"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-white">
                  {scaleFactor === 8 ? "8× Sub-Meter Resolution Telemetry" : "4× Super-Resolution Telemetry"}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#141414] text-white border border-[#333333] font-mono">
                  ✓ Validated
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#141414] text-white border border-[#333333] font-mono flex items-center gap-1">
                  <Zap size={11} className="text-white" /> Sen2SR-RRDB
                </span>
              </div>
              <p className="text-xs text-[#777] font-mono mt-0.5 tabular-nums">
                Beyond Pixels · Lat {result.lat.toFixed(5)}°, Lon {result.lon.toFixed(5)}° · Job ID:{" "}
                <strong className="text-white font-mono">{result.job_id}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111111] border border-[#222222] font-mono tabular-nums text-[#aaa] text-xs">
            <Clock size={12} className="text-white" />
            <span>{result.processing_time_s.toFixed(1)}s Runtime</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111111] border border-[#222222] font-mono tabular-nums text-white font-semibold text-xs">
            <Sparkles size={12} />
            <span>{result.sampling_steps_used ?? 50} DDIM Steps</span>
          </div>

          <button
            onClick={() => setReportOpen(true)}
            className="btn-white flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-[#eaeaea] font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <FileText size={13} />
            <span>Executive Dossier</span>
          </button>
        </div>
      </header>

      {/* ── Spatial Comparison Cards ── */}
      <section className="space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map size={15} className="text-white" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              {hasBothModels ? "Dual-Model Multi-Raster Comparison" : "High-Fidelity Spatial Triad Comparison"}
            </h2>
          </div>
          <span className="text-xs text-[#888] font-mono">
            Ground Footprint: 1.28 km × 1.28 km
          </span>
        </div>

        {hasBothModels ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. S2 Input */}
            <CompareImageCard
              label="Sentinel-2 L2A Input"
              src={result.lr_rgb_url}
              badge={`${result.patch_size_px}px @ ${result.lr_resolution_m}m`}
              subtext="10m native BOA reflectance"
              onMaximize={() =>
                setMaximizeImage({
                  title: "Sentinel-2 L2A Input (10m Resolution)",
                  src: result.lr_rgb_url,
                  badge: "10m Baseline S2",
                  resolution: `Ground Sampling Distance: ${result.lr_resolution_m}m`,
                  dimensions: `${result.patch_size_px} × ${result.patch_size_px} px`,
                  subtext: "Surface reflectance RGB composite directly from Copernicus Sentinel-2.",
                })
              }
            />

            {/* 2. Sen2SR-RRDB */}
            <CompareImageCard
              label="⚡ Sen2SR-RRDB (Able)"
              src={result.sr_able_url || result.sr_rgb_url}
              badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
              subtext="Custom 4× RRDB (<1s latency)"
              onMaximize={() =>
                setMaximizeImage({
                  title: "Sen2SR-RRDB Super-Resolved (Able Model)",
                  src: result.sr_able_url || result.sr_rgb_url,
                  badge: "Sen2SR-RRDB (Custom Model)",
                  resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m`,
                  dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                  subtext: "Feedforward Residual-in-Residual Dense Block architecture trained from scratch for satellite super-resolution.",
                })
              }
            />

            {/* 3. Latent Diffusion */}
            <CompareImageCard
              label="🌊 Latent Diffusion"
              src={result.sr_diffusion_url || result.sr_rgb_url}
              badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
              subtext={`LDSR-S2 (${result.sampling_steps_used ?? 50} DDIM)`}
              onMaximize={() =>
                setMaximizeImage({
                  title: "Latent Diffusion Super-Resolved (LDSR-S2)",
                  src: result.sr_diffusion_url || result.sr_rgb_url,
                  badge: "Latent Diffusion",
                  resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m`,
                  dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                  subtext: "Diffusion-driven generative super-resolution synthesis with Fourier hard constraint.",
                })
              }
            />

            {/* 4. Uncertainty */}
            {result.uncertainty_url ? (
              <CompareImageCard
                label="Epistemic Uncertainty"
                src={result.uncertainty_url}
                badge="Std dev variance"
                subtext="Plasma map (brighter = higher uncertainty)"
                onMaximize={() =>
                  setMaximizeImage({
                    title: "Per-Pixel Epistemic Uncertainty Map",
                    src: result.uncertainty_url,
                    badge: "Monte-Carlo Uncertainty",
                    resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m`,
                    dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                    subtext: "Predictive dispersion across stochastic multi-pass variations.",
                    colorScale: {
                      gradient: "linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)",
                      minLabel: "0.0 (High Confidence)",
                      maxLabel: "Max (Epistemic Dispersion)",
                    },
                  })
                }
              />
            ) : (
              <div className="rounded-2xl glass-card flex items-center justify-center p-6 text-xs text-center text-[#6b7a99]">
                Uncertainty map not available
              </div>
            )}
          </div>
        ) : (
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
              label="Sen2SR-RRDB Super-Resolved"
              src={result.sr_rgb_url}
              badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
              subtext="4× enhanced via Sen2SR-RRDB (<1s)"
              onMaximize={() =>
                setMaximizeImage({
                  title: `Sen2SR-RRDB Super-Resolved SRM (${result.sr_resolution_m}m Resolution)`,
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
              <div className="rounded-2xl glass-card flex items-center justify-center p-6 text-xs text-center text-[#6b7a99]">
                Uncertainty map not generated for this run
              </div>
            )}
          </div>
        )}
      </section>

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
      <section
        className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm font-mono"
        style={{ background: "#0c0c0c", border: "1px solid #1f1f1f", color: "#f5f5f5" }}
      >
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Enterprise GeoTIFF Deliverables
          </h3>
          <p className="text-xs text-[#888] mt-0.5">
            Download 32-bit float GeoTIFFs georeferenced in Sentinel-2 UTM coordinate reference system.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href={srTifUrl}
            download
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
            style={{ background: "#ffffff", color: "#000000", border: "1px solid #ffffff" }}
          >
            <FileDown size={14} />
            10-Band SR GeoTIFF ({resStr})
          </a>
          <a
            href={uncTifUrl}
            download
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            style={{ background: "#141414", color: "#ffffff", border: "1px solid #2a2a2a" }}
          >
            <Download size={14} />
            Uncertainty GeoTIFF
          </a>
        </div>
      </section>

      {/* ── Spectral Indices ── */}
      <section className="space-y-3 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-white" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Derived Spectral Indices (Before 10m &amp; After {resStr})
            </h2>
          </div>
          <span className="text-xs text-[#888]">
            Calibrated biophysical indices computed directly on 10m LR and 2.5m SR bands
          </span>
        </div>

        {/* Tab & View Mode Switcher Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
          {/* Index Tabs */}
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(INDEX_CONFIG) as IndexTab[]).map((tab) => {
              const isSel = indexTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setIndexTab(tab)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer font-mono"
                  style={{
                    background: isSel ? "#ffffff" : "#111111",
                    color: isSel ? "#000000" : "#888888",
                    border: `1px solid ${isSel ? "#ffffff" : "#222222"}`,
                  }}
                >
                  {INDEX_CONFIG[tab].label}
                  <span className="ml-1.5 opacity-70 font-normal">— {INDEX_CONFIG[tab].desc}</span>
                </button>
              );
            })}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center rounded-xl p-0.5" style={{ background: "#111111", border: "1px solid #222222" }}>
            {[
              { id: "split", label: "Side-by-Side (Before & After)" },
              { id: "before", label: "Before (10m)" },
              { id: "after", label: `After (${resStr})` },
            ].map(({ id, label }) => {
              const isSel = viewMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id as "split" | "before" | "after")}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer font-mono"
                  style={{
                    background: isSel ? "#ffffff" : "transparent",
                    color: isSel ? "#000000" : "#888888",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Index Viewer Cards */}
        {viewMode === "split" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Card: Before (10m Native Sentinel-2) */}
            <Card3D depth={6} className="overflow-hidden flex flex-col group rounded-2xl"
              style={{ background: "#0c0c0c", border: "1px solid #1f1f1f" }}>
              <div className="p-3 flex items-center justify-between"
                style={{ background: "#111111", borderBottom: "1px solid #1f1f1f" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#888]" />
                  <h3 className="text-xs font-bold text-white">
                    Before: {INDEX_CONFIG[indexTab].label} @ 10m Ground Resolution
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "#1a1a1a", color: "#ffffff", border: "1px solid #333333" }}>
                  Native S2 (10m)
                </span>
              </div>
              <div className="relative w-full aspect-square bg-[#050505] overflow-hidden">
                {result[INDEX_CONFIG[indexTab].lrKey] || result[INDEX_CONFIG[indexTab].srKey] ? (
                  <>
                    <Image
                      src={staticUrl((result[INDEX_CONFIG[indexTab].lrKey] || result[INDEX_CONFIG[indexTab].srKey]) as string)}
                      alt={`${INDEX_CONFIG[indexTab].label} 10m LR`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain"
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
                      className="absolute top-3 right-3 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 shadow-lg opacity-85 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10"
                    >
                      <Maximize2 size={12} />
                      <span>Maximize</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-[#666]">
                    10m index map loading…
                  </div>
                )}
              </div>
              <div className="p-2.5 text-[11px] text-[#888]" style={{ background: "#0e0e0e", borderTop: "1px solid #1f1f1f" }}>
                Coarse 10m grid showing native satellite spatial pixelation.
              </div>
            </Card3D>

            {/* Right Card: After (2.5m Super-Resolved SRM) */}
            <Card3D depth={6} className="overflow-hidden flex flex-col group rounded-2xl"
              style={{ background: "#0c0c0c", border: "1px solid #1f1f1f" }}>
              <div className="p-3 flex items-center justify-between"
                style={{ background: "#111111", borderBottom: "1px solid #1f1f1f" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white" />
                  <h3 className="text-xs font-bold text-white">
                    After: {INDEX_CONFIG[indexTab].label} @ {resStr} Super-Resolved
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "#1a1a1a", color: "#ffffff", border: "1px solid #333333" }}>
                  {scaleFactor === 8 ? "8× Sub-Metre" : "4× Super-Resolved"}
                </span>
              </div>
              <div className="relative w-full aspect-square bg-[#050505] overflow-hidden">
                {result[INDEX_CONFIG[indexTab].srKey] ? (
                  <>
                    <Image
                      src={staticUrl(result[INDEX_CONFIG[indexTab].srKey] as string)}
                      alt={`${INDEX_CONFIG[indexTab].label} SR`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain"
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
                      className="absolute top-3 right-3 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 shadow-lg opacity-85 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10"
                    >
                      <Maximize2 size={12} />
                      <span>Maximize</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-[#666]">
                    Super-resolved index map loading…
                  </div>
                )}
              </div>
              <div className="p-2.5 text-[11px] text-white font-medium" style={{ background: "#0e0e0e", borderTop: "1px solid #1f1f1f" }}>
                Sharp, continuous biophysical boundaries resolved without pixelation.
              </div>
            </Card3D>
          </div>
        ) : (
          /* Single View */
          <Card3D depth={6} className="overflow-hidden flex flex-col group rounded-2xl"
            style={{ background: "#0c0c0c", border: "1px solid #1f1f1f" }}>
            <div className="p-3.5 flex items-center justify-between"
              style={{ background: "#111111", borderBottom: "1px solid #1f1f1f" }}>
              <div>
                <h3 className="text-xs font-bold text-white">
                  {viewMode === "before" ? "Before: Native 10m Input" : `After: ${resStr} Super-Resolved`} — {INDEX_CONFIG[indexTab].fullName}
                </h3>
                <p className="text-[11px] text-[#888] mt-0.5">{INDEX_CONFIG[indexTab].desc}</p>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold"
                style={{ background: "#1a1a1a", color: "#ffffff", border: "1px solid #333333" }}>
                {viewMode === "before" ? "10m Resolution (Native LR)" : `${resStr} Resolution (Enhanced SR)`}
              </span>
            </div>
            <div className="relative w-full aspect-[2/1] sm:aspect-[21/9] bg-[#050505] overflow-hidden">
              <Image
                src={staticUrl(
                  (viewMode === "before"
                    ? result[INDEX_CONFIG[indexTab].lrKey] || result[INDEX_CONFIG[indexTab].srKey]
                    : result[INDEX_CONFIG[indexTab].srKey]) as string
                )}
                alt={INDEX_CONFIG[indexTab].label}
                fill
                className="object-contain"
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
                className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 shadow-lg opacity-85 group-hover:opacity-100 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-10"
              >
                <Maximize2 size={13} />
                <span>Maximize</span>
              </button>
            </div>
            <div className="px-4 py-3 text-xs flex items-center justify-between"
              style={{ background: "#0e0e0e", borderTop: "1px solid #1f1f1f" }}>
              <span>
                <strong className="text-white">{INDEX_CONFIG[indexTab].label}</strong>: {INDEX_CONFIG[indexTab].desc}
              </span>
              <span className="text-[11px] text-[#888]">{INDEX_CONFIG[indexTab].cmapNote}</span>
            </div>
          </Card3D>
        )}

        {/* ── High-Visibility Scale Legend Bar ── */}
        <div className="p-4 rounded-2xl space-y-2.5 shadow-sm font-mono"
          style={{ background: "#0c0c0c", border: "1px solid #1f1f1f" }}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sliders size={13} className="text-white" />
              <span>Radiometric Color Scale &amp; Dynamic Class Legend ({INDEX_CONFIG[indexTab].cmapName})</span>
            </span>
            <span className="text-[11px] text-[#888] font-mono">
              Calibrated Dynamic Range (Shared LR/SR Scale)
            </span>
          </div>

          {/* Continuous Gradient Bar */}
          <div className="space-y-1">
            <div className={`h-3.5 w-full rounded-full ${INDEX_CONFIG[indexTab].gradientClass} shadow-inner border border-black/30`} />
            <div className="flex justify-between text-[11px] text-[#aaa] font-medium font-mono px-0.5 tabular-nums">
              <span>◀ {INDEX_CONFIG[indexTab].lowLabel}</span>
              <span className="text-center font-semibold text-white">{INDEX_CONFIG[indexTab].midLabel}</span>
              <span className="text-right">{INDEX_CONFIG[indexTab].highLabel} ▶</span>
            </div>
          </div>

          {/* Biophysical context note */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#888] gap-1"
            style={{ borderTop: "1px solid #1f1f1f" }}>
            <span>
              <strong className="text-white">Biophysical Function:</strong> {INDEX_CONFIG[indexTab].biophysicalRole}
            </span>
            <span className="font-mono text-white font-semibold">
              Both LR &amp; SR calibrated to identical dynamic range
            </span>
          </div>
        </div>
      </section>

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
