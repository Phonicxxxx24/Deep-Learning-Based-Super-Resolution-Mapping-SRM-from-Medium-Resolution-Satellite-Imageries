"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Settings2,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

import CommandHeader from "@/components/CommandHeader";
import ScansArchiveDrawer from "@/components/ScansArchiveDrawer";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import JobStatusBadge from "@/components/JobStatusBadge";
import ExecutionProgressBar from "@/components/ExecutionProgressBar";
import { RadarReticleIcon } from "@/components/GlobalIcons";
import { submitSRJob, getJobStatus, getPastScans } from "@/utils/api";
import {
  POLL_INTERVAL_MS,
  QUALITY_TIERS,
  type QualityTierSteps,
} from "@/lib/constants";
import type { JobStatus, StatusResponse, ScanRecord } from "@/types";

// Dynamic Leaflet import
const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-2xl glass-panel flex flex-col items-center justify-center gap-3">
      <RadarReticleIcon size={28} className="text-[#0066cc] animate-spin" />
      <span className="text-xs font-medium text-[#6b7a99]">
        Initializing planetary satellite canvas…
      </span>
    </div>
  ),
});

export default function HomePage() {
  const router = useRouter();
  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quality Steps
  const [selectedSteps, setSelectedSteps] = useState<QualityTierSteps>(50);
  const [scaleFactor, setScaleFactor] = useState<number>(4);

  // Past Scans Archive
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pastScans, setPastScans] = useState<ScanRecord[]>([]);

  // Load past scans from SQLite database
  useEffect(() => {
    getPastScans({ limit: 50 })
      .then((res) => {
        if (res && res.scans) setPastScans(res.scans);
      })
      .catch((err) => {
        console.warn("Failed to load past scans from SQLite:", err);
      });
  }, []);

  const handleMapSelect = useCallback((lat: number, lon: number) => {
    setSelectedLatLon({ lat, lon });
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedLatLon) return;
    setSubmitting(true);
    setError(null);
    setProgressPct(0);
    setCurrentStage("queued");
    setElapsedSeconds(0);
    try {
      const res = await submitSRJob({
        lat: selectedLatLon.lat,
        lon: selectedLatLon.lon,
        n_uncertainty: 5,
        sampling_steps: selectedSteps,
        scale_factor: scaleFactor,
      });
      setJobId(res.job_id);
      setJobStatus(res.status);
      setStatusMsg(res.progress_msg);
      setQueuePos(res.queue_position);
      if (typeof res.progress_pct === "number") setProgressPct(res.progress_pct);
      if (res.stage) setCurrentStage(res.stage);
      if (typeof res.elapsed_s === "number") setElapsedSeconds(res.elapsed_s);

      // Re-fetch scans to update counter
      getPastScans({ limit: 50 }).then((r) => r && setPastScans(r.scans));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [selectedLatLon, selectedSteps, scaleFactor]);

  // Polling
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
          setError(s.progress_msg ?? "Pipeline error");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Polling error");
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [jobId, jobStatus, router]);

  const isRunning = jobStatus === "queued" || jobStatus === "running";
  const selectedTier = QUALITY_TIERS.find((t) => t.steps === selectedSteps)!;

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden text-[#1a1f2e]">
      {/* Liquid Organic Mesh Background */}
      <LiquidBackdrop />

      {/* Top Mission Command Header */}
      <CommandHeader
        totalScans={pastScans.length}
        onOpenArchive={() => setArchiveOpen(true)}
        onSearchCoordinates={(lat, lon) => handleMapSelect(lat, lon)}
      />

      {/* Main Workspace Layout */}
      <main className="flex-1 flex flex-col lg:flex-row p-4 sm:p-6 gap-5 min-h-[calc(100vh-70px)]">
        {/* Left: Planetary Satellite Map Canvas */}
        <section className="flex-1 w-full min-h-[560px] lg:min-h-[calc(100vh-100px)] relative rounded-2xl overflow-hidden glass-card p-0 shadow-lg flex flex-col">
          <MapPicker
            onSelect={handleMapSelect}
            selectedPoint={selectedLatLon}
            disabled={isRunning}
          />

        </section>

        {/* Right: Precision Spatial Control HUD */}
        <aside className="w-full lg:w-[420px] flex flex-col gap-3.5 overflow-y-auto pr-1 shrink-0">
          {/* Card 1: Target Coordinates & Resolution Scale */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-3.5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RadarReticleIcon size={15} className="text-[#0066cc]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Target Coordinates & AOI
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">1.28 km Tile</span>
            </div>

            {/* Coordinates Strip */}
            {selectedLatLon ? (
              <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">
                      Target Center
                    </span>
                    <div className="font-mono tabular-nums font-bold text-sm text-slate-900 mt-0.5">
                      {selectedLatLon.lat.toFixed(5)}° N, {selectedLatLon.lon.toFixed(5)}° E
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">
                      Instrument
                    </span>
                    <span className="text-xs font-semibold text-[#0066cc] block mt-0.5">
                      Sentinel-2 MSI
                    </span>
                  </div>
                </div>

                {/* Sub-pixel metadata grid */}
                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-200/80 text-[10px] text-slate-500 font-mono">
                  <div>Tile Footprint: <span className="text-slate-800 font-medium">1.28 × 1.28 km</span></div>
                  <div>Native GSD: <span className="text-slate-800 font-medium">10.0 m/px</span></div>
                  <div>Spectral Bands: <span className="text-slate-800 font-medium">10 Bands (L2A)</span></div>
                  <div>Output Res: <span className="text-[#0066cc] font-semibold">{scaleFactor === 8 ? "0.625m" : "2.5m"}</span></div>
                </div>
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                Click anywhere on the map or select a reference site below.
              </div>
            )}

            {/* Super-Resolution Scale Mode */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <SlidersHorizontal size={12} className="text-[#0066cc]" />
                  <span>Super-Resolution Scale</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {scaleFactor === 8 ? "2048 × 2048 px" : "512 × 512 px"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* 4× Standard */}
                <button
                  type="button"
                  onClick={() => setScaleFactor(4)}
                  disabled={isRunning}
                  className={`p-3 rounded-xl text-left transition-all cursor-pointer border ${
                    scaleFactor === 4
                      ? "bg-white border-[#0066cc] shadow-xs ring-1 ring-[#0066cc]/30"
                      : "bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          scaleFactor === 4 ? "bg-[#0066cc]" : "bg-transparent border border-slate-400"
                        }`}
                      />
                      4× Standard
                    </span>
                    <span className="text-[11px] font-mono text-[#0066cc] font-semibold tabular-nums">
                      2.5m
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-500">
                    512 × 512 px · 16× Density
                  </p>
                </button>

                {/* 8× Ultra */}
                <button
                  type="button"
                  onClick={() => setScaleFactor(8)}
                  disabled={isRunning}
                  className={`p-3 rounded-xl text-left transition-all cursor-pointer border ${
                    scaleFactor === 8
                      ? "bg-white border-emerald-600 shadow-xs ring-1 ring-emerald-600/30"
                      : "bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          scaleFactor === 8 ? "bg-emerald-600" : "bg-transparent border border-slate-400"
                        }`}
                      />
                      8× Sub-Meter
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 font-semibold tabular-nums">
                      0.625m
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-500">
                    2048 × 2048 px · High-Boost
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Configuration & Presets */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-3.5">
            {/* Reference AOI Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Reference AOI Presets
                </span>
                <span className="text-[10px] text-slate-400 font-mono">6 Locations</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { name: "Mumbai Port", desc: "Coastal", lat: 18.9600, lon: 72.8200 },
                  { name: "Ahmedabad Urban", desc: "Built-up", lat: 23.0225, lon: 72.5714 },
                  { name: "Berlin Center", desc: "European", lat: 52.5200, lon: 13.4050 },
                  { name: "Uttarakhand Valley", desc: "Topography", lat: 30.3800, lon: 79.7200 },
                  { name: "Derna Coastal Plain", desc: "Flood Plain", lat: 32.7600, lon: 22.6300 },
                  { name: "Sundarbans Delta", desc: "Wetland", lat: 21.9400, lon: 89.1800 },
                ].map((item) => {
                  const isSelected =
                    selectedLatLon &&
                    Math.abs(selectedLatLon.lat - item.lat) < 0.005 &&
                    Math.abs(selectedLatLon.lon - item.lon) < 0.005;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleMapSelect(item.lat, item.lon)}
                      disabled={isRunning}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer truncate border text-left flex items-center justify-between ${
                        isSelected
                          ? "bg-[#0066cc] text-white border-[#0066cc] shadow-2xs font-semibold"
                          : "bg-slate-50 hover:bg-slate-100/90 text-slate-700 border-slate-200"
                      }`}
                      title={`${item.name} (${item.desc})`}
                    >
                      <span className="truncate">{item.name}</span>
                      <ChevronRight size={12} className={isSelected ? "text-white" : "text-slate-400"} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Inference Steps (Quality) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Settings2 size={13} className="text-[#0066cc]" />
                  <span>DDIM Sampling Steps</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {selectedSteps} Iterations
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {QUALITY_TIERS.map((tier) => (
                  <button
                    key={tier.steps}
                    onClick={() => setSelectedSteps(tier.steps)}
                    disabled={isRunning}
                    className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer border ${
                      selectedSteps === tier.steps
                        ? "bg-[#0066cc] text-white border-[#0066cc] shadow-xs font-semibold"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    <div className="font-bold text-xs tabular-nums">{tier.steps}</div>
                    <div
                      className={`text-[9.5px] tabular-nums ${
                        selectedSteps === tier.steps ? "text-white/80" : "text-slate-500"
                      }`}
                    >
                      {tier.approxTime}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress Bar & Status Display */}
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
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed shadow-2xs font-medium"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Super-Resolution Submit Button */}
          <motion.button
            onClick={handleSubmit}
            disabled={!selectedLatLon || isRunning || submitting}
            whileHover={!selectedLatLon || isRunning ? {} : { scale: 1.005 }}
            whileTap={!selectedLatLon || isRunning ? {} : { scale: 0.995 }}
            className={`mt-auto relative w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !selectedLatLon || isRunning
                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
                : scaleFactor === 8
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 hover:shadow"
                : "bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-[#0066cc]/20 hover:shadow"
            }`}
          >
            {submitting || isRunning ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-slate-400/40 border-t-[#0066cc] rounded-full"
                />
                <span className="font-medium text-slate-700">
                  {isRunning
                    ? `Running ${scaleFactor}× Pipeline (${typeof progressPct === "number" ? progressPct : 15}%)…`
                    : "Initializing Pipeline…"}
                </span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>
                  {selectedLatLon
                    ? scaleFactor === 8
                      ? "Run 8× Sub-Meter Pipeline (0.625m GSD)"
                      : "Run 4× Super-Resolution Pipeline (2.5m GSD)"
                    : "Select Location on Map to Proceed"}
                </span>
                {selectedLatLon && <ChevronRight size={15} />}
              </>
            )}
          </motion.button>
        </aside>
      </main>

      {/* Slide-Out Scans Archive Drawer */}
      <ScansArchiveDrawer
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        scans={pastScans}
        onSelectScanCoordinates={(lat, lon) => handleMapSelect(lat, lon)}
      />
    </div>
  );
}
