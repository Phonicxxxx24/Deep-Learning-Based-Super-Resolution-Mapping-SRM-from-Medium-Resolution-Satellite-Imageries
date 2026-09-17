"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  BarChart2,
  Map,
  Layers,
  AlertCircle,
  Clock,
  Sparkles,
  FileDown,
  Activity,
  TrendingUp,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

import LiquidBackdrop from "./LiquidBackdrop";
import Card3D from "./Card3D";
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

function MetricCard({
  label,
  value,
  unit,
  description,
}: {
  label: string;
  value: number | null;
  unit: string;
  description?: string;
}) {
  return (
    <Card3D depth={6} className="p-3.5 glass-card bg-white/85 flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[#6b7a99] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-xl font-bold font-mono text-[#1a1f2e]">
        {value === null ? "—" : value.toFixed(2)}
        {value !== null && unit ? ` ${unit}` : ""}
      </span>
      {description && (
        <span className="text-[10px] text-[#6b7a99] mt-0.5">
          {description}
        </span>
      )}
    </Card3D>
  );
}

function CompareImageCard({
  label,
  src,
  badge,
  subtext,
}: {
  label: string;
  src: string;
  badge: string;
  subtext?: string;
}) {
  return (
    <Card3D depth={8} className="glass-card bg-white/90 flex flex-col overflow-hidden group">
      <div className="relative w-full aspect-square bg-[#0e131d] overflow-hidden">
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
      </div>
      <div className="p-3.5 bg-white/80">
        <h3 className="text-xs font-bold text-[#1a1f2e]">{label}</h3>
        {subtext && <p className="text-[11px] text-[#6b7a99] mt-0.5">{subtext}</p>}
      </div>
    </Card3D>
  );
}

export default function ResultsPanel({ result }: { result: SRResult }) {
  const [indexTab, setIndexTab] = useState<IndexTab>("ndvi");

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
          />
          <CompareImageCard
            label="Dual-Path Super-Resolved"
            src={result.sr_rgb_url}
            badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
            subtext="4× enhanced RGB composite via LDSR-S2"
          />
          {result.uncertainty_url ? (
            <CompareImageCard
              label="Per-Pixel Epistemic Uncertainty"
              src={result.uncertainty_url}
              badge="Std dev across passes"
              subtext="Plasma map (brighter = higher uncertainty)"
            />
          ) : (
            <div className="rounded-2xl glass-card flex items-center justify-center p-6 text-xs text-center text-[#6b7a99]">
              Uncertainty map not generated for this run
            </div>
          )}
        </div>
      </section>

      {/* ── 10-Band Radiometric Fidelity & Physical Preservation ── */}
      <section className="rounded-2xl p-5 glass-card bg-white/85 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Activity size={18} className="text-[#0066cc]" />
            <div>
              <h2 className="text-sm font-bold text-[#1a1f2e]">
                Spectral Band Value Preservation & Radiometric Fidelity
              </h2>
              <p className="text-xs text-[#6b7a99]">
                Proves physical surface reflectance (BOA) conservation from 10m input to 2.5m output across all 10 Sentinel-2 bands.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#0066cc]/10 text-[#0066cc] border border-[#0066cc]/20">
              <ShieldCheck size={13} />
              <span>Fourier HardConstraint</span>
            </span>

            {meanPreservation && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/25">
                <CheckCircle2 size={13} />
                <span>{meanPreservation}% Mean Preservation</span>
              </span>
            )}
          </div>
        </div>

        {/* Generated Dual-Panel Spectral Chart */}
        {result.spectral_chart_url ? (
          <div className="relative w-full rounded-xl overflow-hidden border border-[#dde3ed] aspect-[2.6/1] bg-[#0e131d] shadow-xs">
            <Image
              src={staticUrl(result.spectral_chart_url)}
              alt="Spectral Reflectance Curve and 10-Band Radiometric Consistency Chart"
              fill
              priority
              loading="eager"
              className="object-contain"
              unoptimized
            />
          </div>
        ) : (
          <div className="flex items-center justify-center p-8 rounded-xl glass-panel text-xs text-[#6b7a99]">
            Spectral chart generating…
          </div>
        )}

        {/* Per-Band Metrics Strip */}
        {result.band_stats && result.band_stats.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#6b7a99]">
              <span className="font-bold uppercase tracking-wider">
                Per-Band Reflectance Metrics (492 nm → 2190 nm)
              </span>
              <span>LR Input vs SR Output (BOA Reflectance)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {result.band_stats.map((s) => (
                <div
                  key={s.band}
                  className="rounded-xl p-2.5 bg-white/70 border border-[#dde3ed] flex flex-col gap-1 text-xs shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1a1f2e]">{s.band}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        s.preservation_pct >= 99.0
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-[#0066cc]/10 text-[#0066cc]"
                      }`}
                    >
                      {s.preservation_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6b7a99]">
                    {s.name} ({s.wavelength_nm} nm)
                  </div>
                  <div className="mt-1 pt-1 border-t border-[#dde3ed] flex justify-between text-[10px] font-mono">
                    <span className="text-sky-600">LR: {s.lr_mean.toFixed(4)}</span>
                    <span className="text-[#0066cc]">SR: {s.sr_mean.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explanatory Guarantee */}
        <div className="rounded-xl p-3.5 bg-[#0066cc]/5 border border-[#0066cc]/20 text-xs leading-relaxed flex items-start gap-3">
          <TrendingUp size={16} className="text-[#0066cc] shrink-0 mt-0.5" />
          <p className="text-[#1a1f2e]">
            <strong className="text-[#0066cc]">Physical Consistency Guarantee:</strong> Unlike generic AI upscalers that invent visual hallucinations, our model mathematically enforces low-frequency Fourier phase and spectral flux conservation against true Sentinel-2 observations, ensuring that downstream calculations (NDVI, biophysical canopy parameters) remain scientifically rigorous.
          </p>
        </div>
      </section>

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

      {/* ── Quality Metrics ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-[#0066cc]" />
          <h2 className="text-sm font-bold text-[#1a1f2e] uppercase tracking-wider">
            Empirical Validation Metrics
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MetricCard
            label="PSNR"
            value={result.metrics.psnr_db}
            unit="dB"
            description="Reconstruction fidelity"
          />
          <MetricCard
            label="SSIM"
            value={result.metrics.ssim}
            unit=""
            description="Structural similarity"
          />
          <MetricCard
            label="SAM"
            value={result.metrics.sam_deg}
            unit="°"
            description="Spectral angle mapper"
          />
          <MetricCard
            label="ERGAS"
            value={result.metrics.ergas}
            unit=""
            description="Relative error ratio"
          />
          <MetricCard
            label="LPIPS"
            value={result.metrics.lpips}
            unit=""
            description="Perceptual similarity"
          />
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
        <Card3D depth={6} className="glass-card bg-white/90 overflow-hidden flex flex-col">
          {result[INDEX_CONFIG[indexTab].urlKey] ? (
            <div className="relative w-full aspect-[2/1] sm:aspect-[21/9] bg-[#0e131d] overflow-hidden">
              <Image
                src={staticUrl(result[INDEX_CONFIG[indexTab].urlKey] as string)}
                alt={INDEX_CONFIG[indexTab].label}
                fill
                className="object-contain"
                unoptimized
              />
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
    </div>
  );
}
