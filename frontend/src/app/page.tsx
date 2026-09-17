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
  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>({
    lat: 19.0760,
    lon: 72.8777,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
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

        {/* Right: Floating Glass 3D Command Deck (HUD) */}
        <aside className="w-full lg:w-[420px] flex flex-col gap-3.5 overflow-y-auto pr-1 shrink-0">
          {/* Card 1: Target Coordinates & Resolution Scale */}
          <div className="p-4 rounded-2xl glass-liquid-card flex flex-col gap-3.5 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RadarReticleIcon size={15} className="text-[#0066cc]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
                  Target Coordinates
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#6b7a99]">1.28 km AOI</span>
            </div>

            {/* Coordinates Strip */}
            {selectedLatLon ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl glass-liquid-inner">
                <div>
                  <span className="text-[9.5px] uppercase font-bold text-[#6b7a99] tracking-wider block">
                    Center Point
                  </span>
                  <div className="font-mono font-bold text-sm text-[#1a1f2e] mt-0.5">
                    {selectedLatLon.lat.toFixed(4)}° N, {selectedLatLon.lon.toFixed(4)}° E
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9.5px] uppercase font-bold text-[#6b7a99] tracking-wider block">
                    Sensor
                  </span>
                  <span className="text-xs font-semibold text-[#0066cc] block mt-0.5">
                    Sentinel-2 L2A
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-[#6b7a99] glass-liquid-inner rounded-xl">
                Click anywhere on the satellite map to lock target coordinates.
              </div>
            )}

            {/* Super-Resolution Scale Mode */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-[#6b7a99] flex items-center gap-1.5">
                  <SlidersHorizontal size={12} className="text-[#0066cc]" />
                  <span>Resolution Scale</span>
                </span>
                <span className="text-[11px] text-[#6b7a99] font-mono">
                  {scaleFactor === 8 ? "2048px output" : "512px output"}
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
                      ? "bg-white border-[#0066cc] shadow-sm ring-1 ring-[#0066cc]/25"
                      : "glass-liquid-inner hover:bg-white/80 border-white/60 text-[#6b7a99]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[#1a1f2e] flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          scaleFactor === 4 ? "bg-[#0066cc]" : "bg-transparent border border-[#6b7a99]"
                        }`}
                      />
                      4× Standard
                    </span>
                    <span className="text-[11px] font-mono text-[#0066cc] font-semibold">
                      2.5m
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6b7a99]">
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
                      ? "bg-white border-emerald-600 shadow-sm ring-1 ring-emerald-600/25"
                      : "glass-liquid-inner hover:bg-white/80 border-white/60 text-[#6b7a99]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[#1a1f2e] flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          scaleFactor === 8 ? "bg-emerald-600" : "bg-transparent border border-[#6b7a99]"
                        }`}
                      />
                      8× Ultra
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                      0.625m
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6b7a99]">
                    2048 × 2048 px · Sub-Meter
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Configuration & Presets */}
          <div className="p-4 rounded-2xl glass-liquid-card flex flex-col gap-3.5 shadow-sm">
            {/* Global Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
                  Event Presets
                </span>
                <span className="text-[10px] text-[#6b7a99]">1-Tap Snap</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { name: "Mumbai Harbour", lat: 18.9600, lon: 72.8200 },
                  { name: "Ahmedabad Metro", lat: 23.0225, lon: 72.5714 },
                  { name: "Berlin Core", lat: 52.5200, lon: 13.4050 },
                  { name: "Uttarakhand Valley", lat: 30.3800, lon: 79.7200 },
                  { name: "Derna Flash Flood", lat: 32.7600, lon: 22.6300 },
                  { name: "Sundarbans Delta", lat: 21.9400, lon: 89.1800 },
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
                          : "glass-liquid-inner hover:bg-white text-[#1a1f2e] border-white/60"
                      }`}
                      title={item.name}
                    >
                      <span className="truncate">{item.name}</span>
                      <ChevronRight size={12} className={isSelected ? "text-white" : "text-[#6b7a99] opacity-60"} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-[#dde3ed]/60" />

            {/* Inference Steps (Quality) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
                  <Settings2 size={13} className="text-[#0066cc]" />
                  <span>DDIM Sampling Steps</span>
                </div>
                <span className="text-[11px] font-mono text-[#6b7a99]">
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
                        : "glass-liquid-inner hover:bg-white text-[#1a1f2e] border-white/60"
                    }`}
                  >
                    <div className="font-bold text-xs">{tier.steps}</div>
                    <div
                      className={`text-[9.5px] ${
                        selectedSteps === tier.steps ? "text-white/80" : "text-[#6b7a99]"
                      }`}
                    >
                      {tier.approxTime}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Status & Error Notification */}
          <AnimatePresence>
            {jobStatus && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl glass-liquid-card"
              >
                <JobStatusBadge status={jobStatus} msg={statusMsg} />
                {queuePos && queuePos > 1 && (
                  <p className="text-[11px] text-[#6b7a99] mt-1.5">
                    Queue Position {queuePos} · Multi-analyst safe GPU serialization.
                  </p>
                )}
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 leading-relaxed"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Liquid Run Super-Resolution Submit Button */}
          <motion.button
            onClick={handleSubmit}
            disabled={!selectedLatLon || isRunning || submitting}
            whileHover={!selectedLatLon || isRunning ? {} : { scale: 1.01 }}
            whileTap={!selectedLatLon || isRunning ? {} : { scale: 0.99 }}
            className={`mt-auto relative w-full py-3.5 px-5 rounded-2xl text-xs sm:text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !selectedLatLon || isRunning
                ? "bg-[#dde3ed] text-[#6b7a99] cursor-not-allowed shadow-none"
                : scaleFactor === 8
                ? "bg-gradient-to-r from-emerald-600 to-[#0066cc] text-white shadow-emerald-600/20 hover:shadow-lg"
                : "bg-[#0066cc] hover:bg-[#0052a3] text-white shadow-[#0066cc]/20 hover:shadow-lg"
            }`}
          >
            {submitting || isRunning ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                />
                <span>
                  {isRunning
                    ? `Running ${scaleFactor}× ${
                        scaleFactor === 8 ? "Ultra-Resolution (2048px)" : "Super-Resolution (512px)"
                      }…`
                    : "Submitting Task…"}
                </span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>
                  {scaleFactor === 8
                    ? "Deploy 8× Ultra-Resolution (2048px · 0.625m)"
                    : "Deploy 4× Super-Resolution (512px · 2.5m)"}
                </span>
                <ChevronRight size={16} />
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
