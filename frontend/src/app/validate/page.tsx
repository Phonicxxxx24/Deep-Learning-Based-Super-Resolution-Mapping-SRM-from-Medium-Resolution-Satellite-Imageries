"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  Cpu,
  Database,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Award,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface ModelCard {
  model_name: string;
  architecture: string;
  parameters_M: number;
  checkpoint_mb: number;
  task: string;
  input_bands: string[];
  scale_factor: number;
  dataset: string;
  total_training_hours: number;
  validation_scenes: number;
  metrics: {
    psnr_db: number;
    ssim: number;
    sam_rad: number;
    sam_deg: number;
    checkerboard_artifacts_pct: number;
  };
  per_band_psnr: Record<string, number>;
  loss_function: {
    formula: string;
    l1_weight: number;
    sam_weight: number;
    laplacian_weight: number;
    gradient_weight: number;
    observation_weight: number;
  };
  comparison: Array<{
    model: string;
    psnr_db: number | null;
    ssim: number | null;
    sam_deg: number | null;
    parameters_M?: number;
    training_hours?: number;
    selected: boolean;
    reason: string;
  }>;
  training_code: string;
  weights_path: string;
}

interface BenchmarkResult {
  status: string;
  dataset: string;
  n_scenes: number;
  model: string;
  aggregate: {
    sr: { psnr_db: number | null; ssim: number | null; sam_deg: number | null; ergas: number | null };
    bicubic_baseline: { psnr_db: number | null; ssim: number | null; sam_deg: number | null; ergas: number | null };
  };
  per_scene: Array<Record<string, unknown>>;
  note: string;
  error?: string;
}

function MetricBadge({
  label,
  value,
  unit = "",
  good,
  target,
}: {
  label: string;
  value: number | null;
  unit?: string;
  good?: boolean;
  target?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-white/5 rounded-xl p-4 border border-white/10">
      <span className="text-xs text-white/50 uppercase tracking-widest">{label}</span>
      <div className="flex items-end gap-1">
        <span className={`text-3xl font-bold tabular-nums ${good ? "text-emerald-400" : "text-white"}`}>
          {value !== null && value !== undefined ? value.toFixed(2) : "—"}
        </span>
        {unit && <span className="text-sm text-white/50 mb-1">{unit}</span>}
      </div>
      {target && <span className="text-xs text-white/40">Target: {target}</span>}
    </div>
  );
}

export default function ValidationPage() {
  const [modelCard, setModelCard] = useState<ModelCard | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkDataset, setBenchmarkDataset] = useState<"spot" | "naip">("spot");
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load model card on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/model-card`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        setModelCard(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load model card");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const runBenchmark = useCallback(async () => {
    setBenchmarkRunning(true);
    setBenchmarkResult(null);
    try {
      const res = await fetch(`${API}/api/benchmark?dataset=${benchmarkDataset}&max_samples=9`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: BenchmarkResult = await res.json();
      setBenchmarkResult(data);
    } catch (e) {
      setBenchmarkResult({
        status: "error",
        dataset: benchmarkDataset,
        n_scenes: 0,
        model: "",
        aggregate: {
          sr: { psnr_db: null, ssim: null, sam_deg: null, ergas: null },
          bicubic_baseline: { psnr_db: null, ssim: null, sam_deg: null, ergas: null },
        },
        per_scene: [],
        note: "",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBenchmarkRunning(false);
    }
  }, [benchmarkDataset]);

  return (
    <div className="min-h-screen bg-[#06080e] text-white font-sans">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#06080e]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Mission Control
            </Link>
            <div className="w-px h-4 bg-white/15" />
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-violet-400" />
              <span className="text-sm font-semibold tracking-wide">Model Validation</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Sen2SR_RGBN · 4.58M params · 35.90 dB PSNR
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* ── Why Metrics Are None on Map Clicks ─────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-semibold mb-1">Why random map clicks show no PSNR/SSIM</p>
              <p className="text-amber-200/70 text-sm leading-relaxed">
                When you click anywhere on the map, we fetch live Sentinel-2 satellite data for that exact location
                — but we have <strong className="text-amber-300">no corresponding real high-resolution aerial
                image</strong> for that random point. Without a ground-truth HR reference, PSNR and SSIM cannot be
                computed. This is normal and honest. <br /><br />
                <strong className="text-amber-300">This validation page solves that.</strong> It runs our model
                on a fixed set of 9 real test scenes where we <em>do</em> have paired Sentinel-2 ↔ SPOT/NAIP
                high-resolution ground truth — producing real, verifiable metrics.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ── Model Card ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading model metrics…
          </div>
        ) : error ? (
          <div className="text-red-400 text-center py-10">{error}</div>
        ) : modelCard ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
            className="space-y-6"
          >
            {/* Title */}
            <div className="flex items-center gap-3">
              <Award className="w-6 h-6 text-violet-400" />
              <div>
                <h2 className="text-xl font-bold">Our Custom-Trained Model</h2>
                <p className="text-sm text-white/50">
                  {modelCard.model_name} — trained from scratch on {modelCard.dataset}
                </p>
              </div>
            </div>

            {/* Info chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: <Cpu className="w-3.5 h-3.5" />, label: `${modelCard.parameters_M}M parameters` },
                { icon: <Database className="w-3.5 h-3.5" />, label: `${modelCard.checkpoint_mb} MB checkpoint` },
                { icon: <BarChart3 className="w-3.5 h-3.5" />, label: `${modelCard.total_training_hours}h training` },
                { icon: <BookOpen className="w-3.5 h-3.5" />, label: `${modelCard.validation_scenes} validation scenes` },
              ].map((chip) => (
                <span
                  key={chip.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-xs text-violet-300"
                >
                  {chip.icon}
                  {chip.label}
                </span>
              ))}
            </div>

            {/* Primary Metrics */}
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                Validation Metrics (50 scenes from SEN2NAIP v2)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricBadge label="PSNR" value={modelCard.metrics.psnr_db} unit="dB" good target=">30 dB" />
                <MetricBadge label="SSIM" value={modelCard.metrics.ssim} good target=">0.85" />
                <MetricBadge label="SAM" value={modelCard.metrics.sam_deg} unit="°" good target="<3.5°" />
                <MetricBadge
                  label="Checkerboard"
                  value={modelCard.metrics.checkerboard_artifacts_pct}
                  unit="%"
                  good
                  target="0%"
                />
              </div>
            </div>

            {/* Per-band PSNR */}
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Per-Band PSNR</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(modelCard.per_band_psnr).map(([band, psnr]) => (
                  <div key={band} className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-xs text-white/50 mb-1">{band.replace("_", " ")}</p>
                    <p className="text-2xl font-bold text-cyan-400 tabular-nums">{psnr.toFixed(2)}</p>
                    <p className="text-xs text-white/30">dB</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture Comparison Table */}
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                Architecture Comparison (3 models tested)
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-4 py-3 text-white/50 font-medium">Model</th>
                      <th className="text-right px-4 py-3 text-white/50 font-medium">PSNR (dB)</th>
                      <th className="text-right px-4 py-3 text-white/50 font-medium">SSIM</th>
                      <th className="text-right px-4 py-3 text-white/50 font-medium">SAM (°)</th>
                      <th className="text-right px-4 py-3 text-white/50 font-medium">Params</th>
                      <th className="text-right px-4 py-3 text-white/50 font-medium">Train Time</th>
                      <th className="px-4 py-3 text-white/50 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelCard.comparison.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-white/5 ${
                          row.selected ? "bg-emerald-500/10" : "hover:bg-white/3"
                        } transition-colors`}
                      >
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          {row.selected ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400/60 shrink-0" />
                          )}
                          {row.model}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.psnr_db !== null ? row.psnr_db.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.ssim !== null ? row.ssim.toFixed(4) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.sam_deg !== null ? `${row.sam_deg.toFixed(2)}°` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-white/60">
                          {row.parameters_M ? `${row.parameters_M}M` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-white/60">
                          {row.training_hours ? `${row.training_hours}h` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.selected
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-red-500/15 text-red-400"
                            }`}
                          >
                            {row.selected ? "✅ Selected" : "❌ Rejected"}
                          </span>
                          <p className="text-xs text-white/35 mt-1 max-w-xs">{row.reason}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Loss Formula */}
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Phase 2 Loss Function</p>
              <code className="text-sm text-cyan-300 font-mono">
                ℒ = {modelCard.loss_function.l1_weight}·ℒ<sub>L1</sub>
                {" "}+ {modelCard.loss_function.sam_weight}·ℒ<sub>SAM</sub>
                {" "}+ {modelCard.loss_function.laplacian_weight}·ℒ<sub>Lap</sub>
                {" "}+ {modelCard.loss_function.gradient_weight}·ℒ<sub>Grad</sub>
                {" "}+ {modelCard.loss_function.observation_weight}·ℒ<sub>Obs</sub>
              </code>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-white/50">
                <span>L1 — pixel fidelity</span>
                <span>SAM — spectral angle (NDVI lock)</span>
                <span>Laplacian — edge sharpness</span>
                <span>Gradient — road/building lines</span>
                <span>Observation — LR consistency</span>
              </div>
            </div>
          </motion.section>
        ) : null}

        {/* ── Live Benchmark ─────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
          className="space-y-5"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-xl font-bold">Live Benchmark Validation</h2>
              <p className="text-sm text-white/50">
                Run our model on 9 real test scenes with paired HR ground truth (opensr-test dataset)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Dataset selector */}
            <div className="flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 p-1">
              {(["spot", "naip"] as const).map((ds) => (
                <button
                  key={ds}
                  onClick={() => setBenchmarkDataset(ds)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    benchmarkDataset === ds
                      ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/40"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {ds.toUpperCase()} Dataset
                </button>
              ))}
            </div>

            <button
              id="run-benchmark-btn"
              onClick={runBenchmark}
              disabled={benchmarkRunning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {benchmarkRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Benchmark…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Validation Test
                </>
              )}
            </button>

            {benchmarkRunning && (
              <p className="text-xs text-white/40 animate-pulse">
                This may take 2–5 minutes — evaluating {benchmarkDataset.toUpperCase()} test scenes…
              </p>
            )}
          </div>

          <AnimatePresence>
            {benchmarkResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {benchmarkResult.status === "error" ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-300 font-semibold">Benchmark Failed</p>
                      <p className="text-sm text-red-400/70 mt-1">{benchmarkResult.error}</p>
                      <p className="text-xs text-white/40 mt-2">
                        Make sure opensr-test is installed: <code className="text-cyan-400">pip install opensr-test</code>
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Aggregate metrics */}
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                        Aggregate Results — {benchmarkResult.n_scenes} real {benchmarkResult.dataset.toUpperCase()} scenes
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* SR Model */}
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
                          <p className="text-xs text-emerald-300 uppercase tracking-widest mb-3">
                            ✅ SR Model (SEN2SRLite)
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <MetricBadge label="PSNR" value={benchmarkResult.aggregate.sr.psnr_db} unit="dB" good target=">30 dB" />
                            <MetricBadge label="SSIM" value={benchmarkResult.aggregate.sr.ssim} good target=">0.85" />
                            <MetricBadge label="SAM" value={benchmarkResult.aggregate.sr.sam_deg} unit="°" good target="<3.5°" />
                            <MetricBadge label="ERGAS" value={benchmarkResult.aggregate.sr.ergas} target="<3" />
                          </div>
                        </div>
                        {/* Bicubic baseline */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                            📐 Bicubic Baseline
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <MetricBadge label="PSNR" value={benchmarkResult.aggregate.bicubic_baseline.psnr_db} unit="dB" />
                            <MetricBadge label="SSIM" value={benchmarkResult.aggregate.bicubic_baseline.ssim} />
                            <MetricBadge label="SAM" value={benchmarkResult.aggregate.bicubic_baseline.sam_deg} unit="°" />
                            <MetricBadge label="ERGAS" value={benchmarkResult.aggregate.bicubic_baseline.ergas} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Note */}
                    <p className="text-xs text-white/40 bg-white/5 rounded-xl p-4 border border-white/10 leading-relaxed">
                      ℹ️ {benchmarkResult.note}
                    </p>

                    {/* Per-scene breakdown */}
                    {benchmarkResult.per_scene.length > 0 && (
                      <div>
                        <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Per-Scene Breakdown</p>
                        <div className="space-y-2">
                          {benchmarkResult.per_scene.map((scene, i) => (
                            <div
                              key={i}
                              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
                            >
                              <button
                                className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors"
                                onClick={() => setExpandedScene(expandedScene === i ? null : i)}
                              >
                                <span className="font-medium">
                                  Scene {(scene.scene_idx as number)} —{" "}
                                  <span className={scene.method === "SEN2SRLite" ? "text-emerald-400" : "text-white/50"}>
                                    {scene.method as string}
                                  </span>
                                </span>
                                <span className="flex items-center gap-3 text-white/60">
                                  <span className="tabular-nums text-xs">
                                    PSNR: {typeof scene.psnr_db === "number" ? scene.psnr_db.toFixed(2) : "—"} dB
                                  </span>
                                  {expandedScene === i ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </span>
                              </button>
                              <AnimatePresence>
                                {expandedScene === i && (
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: "auto" }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      {["psnr_db", "ssim", "sam_deg", "ergas", "lpips"].map((key) => (
                                        <div key={key} className="bg-white/5 rounded-lg p-3">
                                          <p className="text-xs text-white/40 uppercase">{key}</p>
                                          <p className="text-lg font-bold tabular-nums">
                                            {typeof scene[key] === "number"
                                              ? (scene[key] as number).toFixed(4)
                                              : "—"}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </main>
    </div>
  );
}
