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
  ExternalLink,
  Maximize2,
} from "lucide-react";

import LiquidBackdrop from "./LiquidBackdrop";
import Card3D from "./Card3D";
import SpectralFidelityGraphs from "./SpectralFidelityGraphs";
import ImageMaximizeModal, { type MaximizeImageData } from "./ImageMaximizeModal";
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
  { label: string; desc: string; urlKey: keyof SRResult; cmapNote: string }
> = {
  ndvi: {
    label: "NDVI",
    desc: "Normalized Difference Vegetation Index",
    urlKey: "ndvi_url",
    cmapNote: "Green = dense vegetation, Yellow = sparse, Red/Brown = soil/water",
  },
  mndwi: {
    label: "MNDWI",
    desc: "Modified Normalized Difference Water Index",
    urlKey: "mndwi_url",
    cmapNote: "Blue = open water bodies, White/Grey = non-water",
  },
  ndbi: {
    label: "NDBI",
    desc: "Normalized Difference Built-up Index",
    urlKey: "ndbi_url",
    cmapNote: "Red/Orange = urban/built-up, Green/Yellow = non-urban",
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
    <Card3D depth={8} className="glass-card bg-white/90 flex flex-col overflow-hidden group">
      <div
        className="relative w-full aspect-square bg-[#0e131d] overflow-hidden cursor-pointer"
        onClick={onMaximize}
      >
        <Image
          src={staticUrl(src)}
          alt={label}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          unoptimized
        />
        <div className="absolute bottom-2.5 left-2.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-black/75 backdrop-blur-md text-white border border-white/20 shadow-md">
          {badge}
        </div>

        {/* Maximize Button Overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMaximize?.();
          }}
          title="Maximize in full lossless resolution"
          className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-xl bg-black/65 hover:bg-black/85 text-white backdrop-blur-md border border-white/20 shadow-lg opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer z-10"
        >
          <Maximize2 size={12} />
          <span>Maximize</span>
        </button>
      </div>
      <div className="p-3.5 bg-white/80 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-[#1a1f2e]">{label}</h3>
          {subtext && <p className="text-[11px] text-[#6b7a99] mt-0.5">{subtext}</p>}
        </div>
        <button
          onClick={onMaximize}
          title="Maximize image in large full-resolution size"
          className="p-1.5 rounded-lg hover:bg-black/5 text-[#6b7a99] hover:text-[#0066cc] transition-all cursor-pointer shrink-0"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </Card3D>
  );
}

export default function ResultsPanel({ result }: { result: SRResult }) {
  const [indexTab, setIndexTab] = useState<IndexTab>("ndvi");
  const [maximizeImage, setMaximizeImage] = useState<MaximizeImageData | null>(null);

  const srTifUrl = staticUrl(`/static/${result.job_id}_sr_10band_2.5m.tif`);
  const uncTifUrl = staticUrl(`/static/${result.job_id}_uncertainty_2.5m.tif`);

  const meanPreservation =
    result.band_stats && result.band_stats.length > 0
      ? (
          result.band_stats.reduce((acc, s) => acc + s.preservation_pct, 0) /
          result.band_stats.length
        ).toFixed(1)
      : null;

  return (
    <div className="relative min-h-screen p-5 sm:p-8 flex flex-col gap-6 max-w-6xl mx-auto text-[#1a1f2e]">
      {/* Liquid Organic Mesh Background */}
      <LiquidBackdrop />

      {/* ── Top Command Bar ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl glass-panel shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white hover:bg-[#f7f8fa] text-[#1a1f2e] border border-[#dde3ed] shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to Command Map
          </Link>
          <div className="w-px h-6 bg-[#dde3ed]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#1a1f2e]">
                4× Super-Resolution Telemetry
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/25">
                ✓ Inference Complete
              </span>
            </div>
            <p className="text-xs text-[#6b7a99] font-mono mt-0.5">
              Lat {result.lat.toFixed(5)}°, Lon {result.lon.toFixed(5)}° · Job ID:{" "}
              <strong className="text-[#0066cc]">{result.job_id}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill font-mono text-[#1a1f2e]">
            <Clock size={12} className="text-[#0066cc]" />
            <span>{result.processing_time_s.toFixed(1)}s Runtime</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill font-mono text-[#0066cc] font-semibold">
            <Sparkles size={12} />
            <span>{result.sampling_steps_used ?? 50} DDIM Steps</span>
          </div>
        </div>
      </header>

      {/* ── Before / After / Uncertainty Comparison ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map size={15} className="text-[#0066cc]" />
            <h2 className="text-sm font-bold text-[#1a1f2e] uppercase tracking-wider">
              High-Fidelity Spatial Triad Comparison
            </h2>
          </div>
          <span className="text-xs text-[#6b7a99] font-mono">
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
            label="Dual-Path Super-Resolved"
            src={result.sr_rgb_url}
            badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
            subtext="4× enhanced RGB composite via LDSR-S2"
            onMaximize={() =>
              setMaximizeImage({
                title: "Dual-Path Super-Resolved SRM (2.5m Resolution)",
                src: result.sr_rgb_url,
                badge: "2.5m Super-Resolved",
                resolution: `Ground Sampling Distance: ${result.sr_resolution_m}m (4× Super-Resolved)`,
                dimensions: `${result.output_size_px} × ${result.output_size_px} px (Uncompressed)`,
                subtext: "Diffusion-driven super-resolved BOA reflectance composite with Fourier low-pass phase invariance.",
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
                  subtext: "Stochastic standard deviation across diffusion reverse-process sampling steps.",
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
      </section>

      {/* ── 10-Band Radiometric Fidelity & Interactive Vector Graphs ── */}
      <SpectralFidelityGraphs
        bandStats={result.band_stats}
        meanPreservation={meanPreservation}
        srResolutionM={result.sr_resolution_m || 2.5}
        outputSizePx={result.output_size_px || 512}
      />


      {/* ── GeoTIFF Downloads ── */}
      <section className="rounded-2xl p-4.5 glass-card bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
            Enterprise GeoTIFF Deliverables
          </h3>
          <p className="text-xs text-[#1a1f2e] mt-0.5">
            Download 32-bit float GeoTIFFs georeferenced in Sentinel-2 UTM coordinate reference system.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href={srTifUrl}
            download
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-xs transition-all cursor-pointer"
          >
            <FileDown size={14} />
            10-Band SR GeoTIFF (2.5m)
          </a>
          <a
            href={uncTifUrl}
            download
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#f7f8fa] text-[#1a1f2e] border border-[#dde3ed] shadow-2xs transition-all cursor-pointer"
          >
            <Download size={14} />
            Uncertainty GeoTIFF
          </a>
        </div>
      </section>


      {/* ── Spectral Indices ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-[#0066cc]" />
            <h2 className="text-sm font-bold text-[#1a1f2e] uppercase tracking-wider">
              Derived Spectral Indices (2.5m Resolution)
            </h2>
          </div>
          <span className="text-xs text-[#6b7a99]">Computed directly on super-resolved bands</span>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(INDEX_CONFIG) as IndexTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setIndexTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                indexTab === tab
                  ? "bg-[#0066cc] text-white shadow-xs"
                  : "bg-white/80 hover:bg-white text-[#6b7a99] border border-[#dde3ed]"
              }`}
            >
              {INDEX_CONFIG[tab].label}
              <span className="ml-1.5 opacity-80 font-normal">— {INDEX_CONFIG[tab].desc}</span>
            </button>
          ))}
        </div>

        {/* Index Viewer */}
        <Card3D depth={6} className="glass-card bg-white/90 overflow-hidden flex flex-col group">
          {result[INDEX_CONFIG[indexTab].urlKey] ? (
            <div
              className="relative w-full aspect-[2/1] sm:aspect-[21/9] bg-[#0e131d] overflow-hidden cursor-pointer"
              onClick={() => {
                const cfg = INDEX_CONFIG[indexTab];
                setMaximizeImage({
                  title: `${cfg.label} — ${cfg.desc}`,
                  src: result[cfg.urlKey] as string,
                  badge: "2.5m Super-Resolved Index",
                  resolution: "Ground Sampling Distance: 2.5m",
                  dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                  subtext: cfg.cmapNote,
                  colorScale: indexTab === "ndvi"
                    ? { gradient: "linear-gradient(to right, #a50026, #ffffbf, #006837)", minLabel: "-0.3 (Non-Vegetated)", maxLabel: "+0.8 (Dense Canopy)" }
                    : indexTab === "mndwi"
                    ? { gradient: "linear-gradient(to right, #ffffd9, #41b6c4, #081d58)", minLabel: "-0.4 (Land)", maxLabel: "+0.6 (Open Water)" }
                    : { gradient: "linear-gradient(to right, #0d0887, #cc4778, #f0f921)", minLabel: "-0.4 (Vegetation)", maxLabel: "+0.6 (Built-up)" },
                });
              }}
            >
              <Image
                src={staticUrl(result[INDEX_CONFIG[indexTab].urlKey] as string)}
                alt={INDEX_CONFIG[indexTab].label}
                fill
                className="object-contain"
                unoptimized
              />

              {/* Maximize Button Overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const cfg = INDEX_CONFIG[indexTab];
                  setMaximizeImage({
                    title: `${cfg.label} — ${cfg.desc}`,
                    src: result[cfg.urlKey] as string,
                    badge: "2.5m Super-Resolved Index",
                    resolution: "Ground Sampling Distance: 2.5m",
                    dimensions: `${result.output_size_px} × ${result.output_size_px} px`,
                    subtext: cfg.cmapNote,
                    colorScale: indexTab === "ndvi"
                      ? { gradient: "linear-gradient(to right, #a50026, #ffffbf, #006837)", minLabel: "-0.3 (Non-Vegetated)", maxLabel: "+0.8 (Dense Canopy)" }
                      : indexTab === "mndwi"
                      ? { gradient: "linear-gradient(to right, #ffffd9, #41b6c4, #081d58)", minLabel: "-0.4 (Land)", maxLabel: "+0.6 (Open Water)" }
                      : { gradient: "linear-gradient(to right, #0d0887, #cc4778, #f0f921)", minLabel: "-0.4 (Vegetation)", maxLabel: "+0.6 (Built-up)" },
                  });
                }}
                title="Maximize spectral index in full resolution"
                className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/65 hover:bg-black/85 text-white backdrop-blur-md border border-white/20 shadow-lg opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-10"
              >
                <Maximize2 size={13} />
                <span>Maximize</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 gap-2 text-[#6b7a99]">
              <AlertCircle size={16} />
              <span className="text-xs">Spectral index map not generated for this run</span>
            </div>
          )}
          <div className="px-4 py-3 text-xs flex items-center justify-between border-t border-[#dde3ed] bg-white/70">
            <span>
              <strong className="text-[#1a1f2e]">{INDEX_CONFIG[indexTab].label}</strong>:{" "}
              {INDEX_CONFIG[indexTab].desc}
            </span>
            <span className="text-[11px] text-[#6b7a99]">{INDEX_CONFIG[indexTab].cmapNote}</span>
          </div>
        </Card3D>
      </section>

      {/* ── High-Resolution Lossless Maximize Lightbox Modal ── */}
      <ImageMaximizeModal
        image={maximizeImage}
        onClose={() => setMaximizeImage(null)}
      />
    </div>
  );
}
