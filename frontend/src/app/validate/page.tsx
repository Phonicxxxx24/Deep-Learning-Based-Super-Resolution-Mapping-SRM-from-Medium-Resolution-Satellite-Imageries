"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Database,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";

const API = API_BASE;
const STORAGE_KEY_PREFIX = "srm_validation_benchmark_";

interface BenchmarkResult {
  status: string;
  dataset: string;
  n_scenes: number;
  model: string;
  aggregate: {
    sr: { psnr_db: number | null; ssim: number | null; sam_deg: number | null; ergas: number | null };
    bicubic_baseline: { psnr_db: number | null; ssim: number | null; sam_deg: number | null; ergas: number | null };
    able?: { psnr_db: number | null; ssim: number | null; sam_deg: number | null; ergas: number | null };
  };
  per_scene: Array<Record<string, unknown>>;
  note: string;
  error?: string;
  saved_at?: string;
}

function MetricCard({
  label,
  value,
  unit = "",
  highlight = false,
  target,
}: {
  label: string;
  value: number | null;
  unit?: string;
  highlight?: boolean;
  target?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl p-4 border ${highlight ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10"}`}>
      <span className="text-xs text-white/50 uppercase tracking-widest">{label}</span>
      <div className="flex items-end gap-1">
        <span className={`text-3xl font-bold tabular-nums ${highlight ? "text-emerald-400" : "text-white"}`}>
          {value !== null && value !== undefined ? value.toFixed(2) : "—"}
        </span>
        {unit && <span className="text-sm text-white/50 mb-1">{unit}</span>}
      </div>
      {target && <span className="text-xs text-white/40">Target: {target}</span>}
    </div>
  );
}

function ModelBlock({
  title,
  badge,
  metrics,
  highlight = false,
}: {
  title: string;
  badge?: string;
  metrics: { psnr_db: number | null; ssim: number | null; sam_deg: number | null; ergas: number | null } | null;
  highlight?: boolean;
}) {
  if (!metrics) return null;
  return (
    <div className={`rounded-xl p-5 border ${highlight ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10"}`}>
      <div className="flex items-center gap-2 mb-4">
        {highlight ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <span className="w-4 h-4 text-white/30 text-lg leading-none">📐</span>
        )}
        <p className={`text-xs uppercase tracking-widest font-semibold ${highlight ? "text-emerald-300" : "text-white/50"}`}>
          {title}
        </p>
        {badge && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {badge}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="PSNR" value={metrics.psnr_db} unit="dB" highlight={highlight} target=">30 dB" />
        <MetricCard label="SSIM" value={metrics.ssim} highlight={highlight} target=">0.85" />
        <MetricCard label="SAM" value={metrics.sam_deg} unit="°" highlight={highlight} target="<3.5°" />
        <MetricCard label="ERGAS" value={metrics.ergas} highlight={highlight} target="<3" />
      </div>
    </div>
  );
}

export default function ValidationPage() {
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [benchmarkDataset, setBenchmarkDataset] = useState<"spot" | "naip">("spot");
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // 1. Check if a background benchmark is already running or completed on load
  useEffect(() => {
    setMounted(true);
    let isCancelled = false;

    fetch(`${API}/api/benchmark/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((statusData) => {
        if (isCancelled || !statusData) return;
        if (statusData.status === "running") {
          setBenchmarkRunning(true);
          if (statusData.dataset) setBenchmarkDataset(statusData.dataset);
          if (typeof statusData.elapsed_s === "number") setElapsedSeconds(statusData.elapsed_s);
        } else if (statusData.status === "completed" && statusData.result) {
          const enriched: BenchmarkResult = {
            ...statusData.result,
            saved_at: statusData.result.saved_at || new Date().toISOString(),
          };
          if (statusData.dataset === benchmarkDataset) {
            setBenchmarkResult(enriched);
          }
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(`${STORAGE_KEY_PREFIX}${statusData.dataset || benchmarkDataset}`, JSON.stringify(enriched));
            } catch {}
          }
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [benchmarkDataset]);

  // 2. Poll benchmark status while running (even across page navigation/remounting)
  useEffect(() => {
    if (!benchmarkRunning) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/benchmark/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (typeof data.elapsed_s === "number") {
          setElapsedSeconds(data.elapsed_s);
        }

        if (data.status === "completed" && data.result) {
          setBenchmarkRunning(false);
          const enriched: BenchmarkResult = {
            ...data.result,
            saved_at: data.result.saved_at || new Date().toISOString(),
          };
          setBenchmarkResult(enriched);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(`${STORAGE_KEY_PREFIX}${data.dataset || benchmarkDataset}`, JSON.stringify(enriched));
            } catch {}
          }
        } else if (data.status === "error") {
          setBenchmarkRunning(false);
          setBenchmarkResult({
            status: "error",
            dataset: data.dataset || benchmarkDataset,
            n_scenes: 0,
            model: "",
            aggregate: {
              sr: { psnr_db: null, ssim: null, sam_deg: null, ergas: null },
              bicubic_baseline: { psnr_db: null, ssim: null, sam_deg: null, ergas: null },
            },
            per_scene: [],
            note: "",
            error: data.error || "Benchmark execution failed",
          });
        }
      } catch (err) {
        console.warn("Status polling error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [benchmarkRunning, benchmarkDataset]);

  // 3. Restore stored benchmark from localStorage or backend cache on load/switch
  useEffect(() => {
    if (benchmarkRunning) return;
    let isCancelled = false;
    const storageKey = `${STORAGE_KEY_PREFIX}${benchmarkDataset}`;

    // Try local storage first for instant retrieval
    try {
      const localData = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (localData) {
        const parsed: BenchmarkResult = JSON.parse(localData);
        if (parsed && parsed.status === "ok") {
          setBenchmarkResult(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn("Could not read local benchmark cache:", e);
    }

    // Fall back to backend disk cache
    fetch(`${API}/api/benchmark/latest?dataset=${benchmarkDataset}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BenchmarkResult | null) => {
        if (!isCancelled && data && data.status === "ok") {
          const enriched: BenchmarkResult = {
            ...data,
            saved_at: data.saved_at || new Date().toISOString(),
          };
          setBenchmarkResult(enriched);
          try {
            if (typeof window !== "undefined") {
              localStorage.setItem(storageKey, JSON.stringify(enriched));
            }
          } catch {}
        } else if (!isCancelled) {
          setBenchmarkResult(null);
        }
      })
      .catch(() => {
        if (!isCancelled) setBenchmarkResult(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [benchmarkDataset, benchmarkRunning]);

  const runBenchmark = useCallback(async () => {
    setBenchmarkRunning(true);
    setElapsedSeconds(0);
    setBenchmarkResult(null);
    setExpandedScene(null);
    const storageKey = `${STORAGE_KEY_PREFIX}${benchmarkDataset}`;

    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    } catch {}

    try {
      const res = await fetch(`${API}/api/benchmark/start?dataset=${benchmarkDataset}&max_samples=9`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (typeof data.elapsed_s === "number") {
        setElapsedSeconds(data.elapsed_s);
      }
    } catch (e) {
      setBenchmarkRunning(false);
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
        error: e instanceof Error ? e.message : "Failed to launch background benchmark",
      });
    }
  }, [benchmarkDataset]);

  const clearStoredBenchmark = useCallback(async () => {
    const storageKey = `${STORAGE_KEY_PREFIX}${benchmarkDataset}`;
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    } catch {}
    setBenchmarkResult(null);
    setExpandedScene(null);
    try {
      await fetch(`${API}/api/benchmark/latest?dataset=${benchmarkDataset}`, { method: "DELETE" });
    } catch {}
  }, [benchmarkDataset]);

  // Group per-scene rows by scene_idx
  const scenes = benchmarkResult?.per_scene
    ? Array.from(new Set(benchmarkResult.per_scene.map((r) => r.scene_idx as number))).sort((a, b) => a - b)
    : [];

  return (
    <div className="min-h-screen bg-[#06080e] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#06080e]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              Back to Mission Control
            </Link>
            <div className="w-px h-4 bg-white/15" />
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-violet-400" />
              <span className="text-sm font-semibold tracking-wide">Live Benchmark Validation</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* Why no PSNR on map clicks */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-semibold text-sm mb-1">
              Why random map clicks show no PSNR/SSIM
            </p>
            <p className="text-amber-200/70 text-sm leading-relaxed">
              When you click anywhere on the map, we fetch live Sentinel-2 data — but we have{" "}
              <strong className="text-amber-300">no real high-resolution aerial image</strong> for that random point.
              Without a ground-truth HR reference, PSNR/SSIM cannot be computed.{" "}
              <strong className="text-amber-300">This benchmark solves that</strong> — it tests our model on
              9 fixed real scenes where we <em>do</em> have paired SPOT/NAIP ground truth.
            </p>
          </div>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }}
          className="flex items-center gap-4 flex-wrap"
        >
          <div className="flex items-center gap-1 bg-white/5 rounded-xl border border-white/10 p-1">
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
                Running in Background… ({elapsedSeconds}s)
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Validation Test
              </>
            )}
          </button>

          {benchmarkRunning && (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span>
                Evaluating models on {benchmarkDataset.toUpperCase()} scenes in background ({elapsedSeconds}s elapsed) — you can safely leave this page anytime!
              </span>
            </div>
          )}
        </motion.div>

        {/* Results */}
        <AnimatePresence>
          {benchmarkResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              {benchmarkResult.status === "error" ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-semibold">Benchmark Failed</p>
                    <p className="text-sm text-red-400/70 mt-1">{benchmarkResult.error}</p>
                    <p className="text-xs text-white/40 mt-2">
                      Make sure <code className="text-cyan-400">opensr-test</code> is installed and model weights are present.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Stored Cache Status Banner */}
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-white/70 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>
                        <strong className="text-emerald-400 font-medium">Stored Test Data Active:</strong>{" "}
                        {benchmarkResult.dataset.toUpperCase()} Evaluation ({benchmarkResult.n_scenes} Scenes)
                        {benchmarkResult.saved_at && mounted && (
                          <span className="text-white/40 ml-1 font-mono text-[11px]">
                            • Saved {new Date(benchmarkResult.saved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })},{" "}
                            {new Date(benchmarkResult.saved_at).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearStoredBenchmark}
                      className="text-xs text-white/40 hover:text-red-400 transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
                      title="Clear stored benchmark data"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Stored Data
                    </button>
                  </div>

                  {/* Aggregate */}
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                      Aggregate Results — {benchmarkResult.n_scenes} real {benchmarkResult.dataset.toUpperCase()} scenes with ground truth
                    </p>
                    <div className={`grid gap-4 ${benchmarkResult.aggregate.able ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                      {/* Our Able model — highlight if present */}
                      {benchmarkResult.aggregate.able && (
                        <ModelBlock
                          title="Our Model — Sen2SR_RGBN (Able)"
                          badge="Trained by us"
                          metrics={benchmarkResult.aggregate.able}
                          highlight
                        />
                      )}
                      <ModelBlock
                        title="SEN2SRLite (ESA Pre-trained)"
                        metrics={benchmarkResult.aggregate.sr}
                        highlight={!benchmarkResult.aggregate.able}
                      />
                      <ModelBlock
                        title="Bicubic Baseline"
                        metrics={benchmarkResult.aggregate.bicubic_baseline}
                      />
                    </div>
                  </div>

                  {/* Note */}
                  <p className="text-xs text-white/40 bg-white/5 rounded-xl p-4 border border-white/10 leading-relaxed">
                    ℹ️ All three models tested on the same {benchmarkResult.n_scenes} real SPOT/NAIP scenes with the same HR ground truth.
                    Metrics are directly comparable. Our Sen2SR_RGBN uses only 4 bands (RGBN); SEN2SRLite uses all 10 bands.
                    Both are compared against the 4-band RGBN ground truth.
                  </p>

                  {/* Per-scene breakdown */}
                  {scenes.length > 0 && (
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                        Per-Scene Breakdown
                      </p>
                      <div className="space-y-2">
                        {scenes.map((sceneIdx) => {
                          const rows = benchmarkResult.per_scene.filter(
                            (r) => r.scene_idx === sceneIdx
                          );
                          const ableRow = rows.find((r) => r.method === "Able_RRDB");
                          const srRow = rows.find((r) => r.method === "SEN2SRLite");
                          const bicRow = rows.find((r) => r.method === "Bicubic_Baseline");
                          const isOpen = expandedScene === sceneIdx;

                          return (
                            <div
                              key={sceneIdx}
                              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
                            >
                              <button
                                className="w-full flex items-center justify-between px-5 py-3 text-sm text-left hover:bg-white/5 transition-colors"
                                onClick={() => setExpandedScene(isOpen ? null : sceneIdx)}
                              >
                                <span className="font-medium">Scene {sceneIdx}</span>
                                <span className="flex items-center gap-4 text-white/60 text-xs">
                                  {ableRow && (
                                    <span className="text-emerald-400">
                                      Able: {typeof ableRow.psnr_db === "number" ? ableRow.psnr_db.toFixed(2) : "—"} dB
                                    </span>
                                  )}
                                  {srRow && (
                                    <span>
                                      SEN2SRLite: {typeof srRow.psnr_db === "number" ? srRow.psnr_db.toFixed(2) : "—"} dB
                                    </span>
                                  )}
                                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </span>
                              </button>

                              <AnimatePresence>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: "auto" }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden border-t border-white/10"
                                  >
                                    <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      {[
                                        { row: ableRow, label: "Our Model (Able)", green: true },
                                        { row: srRow, label: "SEN2SRLite", green: false },
                                        { row: bicRow, label: "Bicubic", green: false },
                                      ].map(({ row, label, green }) =>
                                        row ? (
                                          <div
                                            key={label}
                                            className={`rounded-lg p-3 border ${green ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/8"}`}
                                          >
                                            <p className={`text-xs mb-2 font-medium ${green ? "text-emerald-400" : "text-white/50"}`}>
                                              {label}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                              {["psnr_db", "ssim", "sam_deg", "ergas"].map((k) => (
                                                <div key={k}>
                                                  <span className="text-white/30 uppercase">{k.replace("_", " ")}</span>
                                                  <p className="font-bold tabular-nums text-sm">
                                                    {typeof row[k] === "number"
                                                      ? (row[k] as number).toFixed(3)
                                                      : "—"}
                                                  </p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
