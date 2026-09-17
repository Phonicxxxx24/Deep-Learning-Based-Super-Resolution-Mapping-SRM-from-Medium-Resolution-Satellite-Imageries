"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Layers,
  Sparkles,
  FileDown,
  FileText,
  Clock,
  Maximize2,
  X,
  Eye,
  Info,
} from "lucide-react";

import LiquidBackdrop from "./LiquidBackdrop";
import ImageSwipeComparator from "./ImageSwipeComparator";
import ExecutiveReportModal from "./ExecutiveReportModal";
import SpectralFidelityGraphs from "./SpectralFidelityGraphs";
import type { SRResult } from "@/types";
import { staticUrl } from "@/utils/api";

interface ChannelConfig {
  id: string;
  title: string;
  badge: string;
  badgeColor: string;
  src?: string | null;
  resolution: string;
  formula?: string;
  interpretation: string;
  colorScale?: { minLabel: string; maxLabel: string; gradient: string };
}

function SpectralChannelCard({
  channel,
  onInspect,
}: {
  channel: ChannelConfig;
  onInspect: (ch: ChannelConfig) => void;
}) {
  return (
    <div className="rounded-2xl glass-liquid-card flex flex-col overflow-hidden group shadow-sm transition-all hover:shadow-md hover:border-[#0066cc]/40">
      {/* Top Header Strip */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/60 bg-white/40">
        <div>
          <span className="text-[9.5px] uppercase font-bold text-[#6b7a99] tracking-wider block">
            {channel.resolution}
          </span>
          <h3 className="text-xs font-bold text-[#1a1f2e] truncate">{channel.title}</h3>
        </div>
        <span
          className="text-[9.5px] font-bold px-2 py-0.5 rounded-full border"
          style={{
            backgroundColor: `${channel.badgeColor}15`,
            color: channel.badgeColor,
            borderColor: `${channel.badgeColor}30`,
          }}
        >
          {channel.badge}
        </span>
      </div>

      {/* Image Container - Square Aspect Ratio without letterbox */}
      <div
        onClick={() => channel.src && onInspect(channel)}
        className="relative w-full aspect-square bg-[#0f172a] overflow-hidden cursor-pointer"
      >
        {channel.src ? (
          <>
            <Image
              src={staticUrl(channel.src)}
              alt={channel.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-2xs">
              <Maximize2 size={14} />
              <span>Inspect</span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#6b7a99]">
            Channel unavailable
          </div>
        )}
      </div>

      {/* Footer Info & Physics Legend */}
      <div className="p-3 glass-liquid-inner flex flex-col gap-1.5 mt-auto">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#1a1f2e] font-semibold">{channel.interpretation}</span>
          {channel.formula && (
            <span className="text-[9.5px] font-mono text-[#6b7a99]">{channel.formula}</span>
          )}
        </div>
        {channel.colorScale ? (
          <div className="flex flex-col gap-0.5 pt-1 border-t border-white/50">
            <div
              className="w-full h-1.5 rounded-full"
              style={{ background: channel.colorScale.gradient }}
            />
            <div className="text-[9px] font-mono text-[#6b7a99] flex justify-between">
              <span>{channel.colorScale.minLabel}</span>
              <span>{channel.colorScale.maxLabel}</span>
            </div>
          </div>
        ) : (
          <div className="pt-1 border-t border-white/50 text-[9px] text-[#6b7a99] font-mono">
            True Color RGB Composite (B04-B03-B02)
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPanel({ result }: { result: SRResult }) {
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [activeInspectChannel, setActiveInspectChannel] = useState<ChannelConfig | null>(null);
  const [scaleFactor, setScaleFactor] = useState<number>(result.scale_factor ?? 4);

  const resStr = result.sr_resolution_m ? `${result.sr_resolution_m}m` : (scaleFactor === 8 ? "0.625m" : "2.5m");
  const sizePx = result.output_size_px ?? (scaleFactor === 8 ? 2048 : 512);

  const srTifUrl = staticUrl(`/static/${result.job_id}_sr_10band_${resStr}.tif`);
  const uncTifUrl = staticUrl(`/static/${result.job_id}_uncertainty_${resStr}.tif`);

  const meanPreservation =
    result.band_stats && result.band_stats.length > 0
      ? (
          result.band_stats.reduce((acc, s) => acc + s.preservation_pct, 0) /
          result.band_stats.length
        ).toFixed(1)
      : null;

  // 5-Channel Spectral Suite Definitions
  const channels: ChannelConfig[] = [
    {
      id: "lr",
      title: "Normal Sentinel-2",
      badge: "10m L2A",
      badgeColor: "#0066cc",
      src: result.lr_rgb_url,
      resolution: "Input Optical",
      interpretation: "Native Optical S2",
      formula: "B04 + B03 + B02",
    },
    {
      id: "sr",
      title: "New Processed Event",
      badge: `${scaleFactor}× Super-Res`,
      badgeColor: scaleFactor === 8 ? "#059669" : "#0284c7",
      src: result.sr_rgb_url,
      resolution: `${resStr} Sub-Meter`,
      interpretation: "Dual-Path Enhanced",
      formula: "LDSR-S2 + SEN2SR",
    },
    {
      id: "ndvi",
      title: "NDVI Vegetation Filter",
      badge: "Canopy Index",
      badgeColor: "#16a34a",
      src: result.ndvi_url,
      resolution: `${resStr} Resolution`,
      interpretation: "Biomass & Chlorophyll",
      formula: "(B08-B04)/(B08+B04)",
      colorScale: {
        minLabel: "Sparse [-0.2]",
        maxLabel: "Dense [+0.8]",
        gradient: "linear-gradient(to right, #a16207, #ca8a04, #84cc16, #15803d)",
      },
    },
    {
      id: "mndwi",
      title: "MNDWI Hydrology Filter",
      badge: "Water Index",
      badgeColor: "#0284c7",
      src: result.mndwi_url,
      resolution: `${resStr} Resolution`,
      interpretation: "Water & Moisture",
      formula: "(B03-B11)/(B03+B11)",
      colorScale: {
        minLabel: "Non-Water [-0.4]",
        maxLabel: "Deep Water [+0.6]",
        gradient: "linear-gradient(to right, #f8fafc, #93c5fd, #3b82f6, #1d4ed8)",
      },
    },
    {
      id: "ndbi",
      title: "NDBI Urban Filter",
      badge: "Built-up Index",
      badgeColor: "#ea580c",
      src: result.ndbi_url,
      resolution: `${resStr} Resolution`,
      interpretation: "Impervious Concrete",
      formula: "(B11-B08)/(B11+B08)",
      colorScale: {
        minLabel: "Natural [-0.4]",
        maxLabel: "Urban Built-up [+0.6]",
        gradient: "linear-gradient(to right, #22c55e, #facc15, #f97316, #b91c1c)",
      },
    },
  ];

  return (
    <div className="relative min-h-screen w-full max-w-[100vw] px-4 sm:px-8 lg:px-12 py-5 flex flex-col gap-5 text-[#1a1f2e]">
      {/* Liquid Organic Mesh Background */}
      <LiquidBackdrop />

      {/* ── Top Command Bar ── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl glass-liquid-card shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl glass-liquid-inner hover:bg-white text-[#1a1f2e] border border-white/60 shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeft size={14} /> Command Map
          </Link>
          <div className="w-px h-6 bg-[#dde3ed]/60" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-[#1a1f2e]">
                {scaleFactor === 8 ? "8× Ultra-Resolution (2048px · 0.625m)" : "4× Super-Resolution (512px · 2.5m)"} Telemetry
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                ✓ Complete
              </span>
            </div>
            <p className="text-[11px] text-[#6b7a99] font-mono mt-0.5">
              Lat {result.lat.toFixed(4)}°, Lon {result.lon.toFixed(4)}° · Job{" "}
              <strong className="text-[#0066cc] font-mono">{result.job_id}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-liquid-inner text-[11px] font-mono text-[#1a1f2e]">
            <span>{result.processing_time_s.toFixed(1)}s Runtime</span>
            <span className="opacity-30">|</span>
            <span className="text-[#0066cc] font-semibold">{result.sampling_steps_used ?? 50} DDIM</span>
            <span className="opacity-30">|</span>
            <span className="text-emerald-700 font-semibold">{scaleFactor}× Scale</span>
          </div>

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0066cc] text-white hover:bg-[#0052a3] font-semibold text-xs transition-all shadow-xs cursor-pointer"
          >
            <FileText size={13} />
            <span>Executive Dossier</span>
          </button>
        </div>
      </header>

      {/* ── Interactive Split-Screen Swipe Visual Comparator ── */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#0066cc]" />
            <h2 className="text-sm font-bold text-[#1a1f2e] uppercase tracking-wider">
              Interactive Split-Screen Visual Comparator
            </h2>
          </div>
          <span className="text-xs text-[#6b7a99] font-mono">
            Drag divider to inspect resolution leap · Scroll to zoom · Drag to pan
          </span>
        </div>

        <ImageSwipeComparator
          lrUrl={result.lr_rgb_url}
          srUrl={result.sr_rgb_url}
          ndviUrl={result.ndvi_url}
          mndwiUrl={result.mndwi_url}
          ndbiUrl={result.ndbi_url}
          uncertaintyUrl={result.uncertainty_url}
          initialScale={result.scale_factor ?? 4}
          aoiLabel={`Lat ${result.lat.toFixed(4)}, Lon ${result.lon.toFixed(4)}`}
        />
      </section>

      {/* ── Derived Spectral Indices & Multi-Band Suite (Normal S2, Processed Event, and All 3 Filters) ── */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#0066cc]" />
            <div>
              <h2 className="text-sm font-bold text-[#1a1f2e] uppercase tracking-wider">
                Derived Spectral Indices & Physical Channel Suite
              </h2>
              <p className="text-xs text-[#6b7a99]">
                Normal Sentinel-2 input, new super-resolved event, and derived spectral filters (NDVI, MNDWI, NDBI).
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#0066cc] bg-[#0066cc]/10 px-3 py-1 rounded-full font-semibold shrink-0">
            {resStr} Resolution · {sizePx}×{sizePx}px Full-Bleed
          </span>
        </div>

        {/* 5-Card Synchronized Multi-Channel Gallery */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {channels.map((ch) => (
            <SpectralChannelCard
              key={ch.id}
              channel={ch}
              onInspect={(channel) => setActiveInspectChannel(channel)}
            />
          ))}
        </div>
      </section>

      {/* ── 10-Band Radiometric Fidelity & Interactive Vector Graphs ── */}
      <SpectralFidelityGraphs
        bandStats={result.band_stats}
        meanPreservation={meanPreservation}
        scaleFactor={scaleFactor}
      />

      {/* ── GeoTIFF Downloads ── */}
      <section className="rounded-2xl p-4 glass-liquid-card flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-sm">
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
            10-Band SR GeoTIFF ({resStr})
          </a>
          {uncTifUrl && (
            <a
              href={uncTifUrl}
              download
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold glass-liquid-inner hover:bg-white text-[#1a1f2e] border border-white/60 shadow-2xs transition-all cursor-pointer"
            >
              <Download size={14} />
              Uncertainty GeoTIFF
            </a>
          )}
        </div>
      </section>

      {/* ── Inspect Channel Modal ── */}
      <AnimatePresence>
        {activeInspectChannel && activeInspectChannel.src && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveInspectChannel(null)}
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl w-full rounded-2xl glass-liquid-card overflow-hidden shadow-2xl flex flex-col cursor-default"
            >
              <div className="px-4 py-3 flex items-center justify-between border-b border-white/60 bg-white/60">
                <div>
                  <h3 className="text-sm font-bold text-[#1a1f2e]">
                    {activeInspectChannel.title}
                  </h3>
                  <p className="text-[11px] text-[#6b7a99]">
                    {activeInspectChannel.interpretation} · {activeInspectChannel.resolution}
                  </p>
                </div>
                <button
                  onClick={() => setActiveInspectChannel(null)}
                  className="p-1.5 rounded-full hover:bg-black/5 text-[#6b7a99] transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="relative w-full aspect-square bg-[#0a0f1d] max-h-[70vh]">
                <Image
                  src={staticUrl(activeInspectChannel.src)}
                  alt={activeInspectChannel.title}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="p-3.5 glass-liquid-inner flex items-center justify-between text-xs">
                {activeInspectChannel.formula && (
                  <span className="font-mono text-[#6b7a99]">
                    Formula: <strong className="text-[#1a1f2e]">{activeInspectChannel.formula}</strong>
                  </span>
                )}
                {activeInspectChannel.colorScale && (
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-[#6b7a99]">
                      {activeInspectChannel.colorScale.minLabel}
                    </span>
                    <div
                      className="w-32 h-2 rounded-full"
                      style={{ background: activeInspectChannel.colorScale.gradient }}
                    />
                    <span className="text-[11px] font-mono text-[#6b7a99]">
                      {activeInspectChannel.colorScale.maxLabel}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
