"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  MapPin,
  ChevronRight,
  Settings2,
  Sparkles,
  Zap,
  Activity,
  Layers,
  ArrowUpRight,
} from "lucide-react";

import CommandHeader from "@/components/CommandHeader";
import ScansArchiveDrawer from "@/components/ScansArchiveDrawer";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import Card3D from "@/components/Card3D";
import JobStatusBadge from "@/components/JobStatusBadge";
import {
  RadarReticleIcon,
  UrbanGridIcon,
  DisasterPulseIcon,
  AgricultureLeafIcon,
  SpectralPrismIcon,
} from "@/components/GlobalIcons";
import { submitSRJob, getJobStatus, getPastScans } from "@/utils/api";
import {
  POLL_INTERVAL_MS,
  SR_RES_M,
  LR_RES_M,
  PATCH_FOOTPRINT_M,
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

const GLOBAL_EVENT_PRESETS = [
  {
    category: "Urban Growth",
    icon: <UrbanGridIcon size={14} />,
    color: "#0066cc",
    items: [
      { name: "Mumbai Harbour", lat: 18.9600, lon: 72.8200 },
      { name: "Ahmedabad Metropolis", lat: 23.0225, lon: 72.5714 },
      { name: "Berlin Core", lat: 52.5200, lon: 13.4050 },
    ],
  },
  {
    category: "Disaster & Crisis",
    icon: <DisasterPulseIcon size={14} />,
    color: "#d93025",
    items: [
      { name: "Uttarakhand Valley", lat: 30.3800, lon: 79.7200 },
      { name: "Derna Flash Flood", lat: 32.7600, lon: 22.6300 },
      { name: "Sundarbans Delta", lat: 21.9400, lon: 89.1800 },
    ],
  },
  {
    category: "Food Security",
    icon: <AgricultureLeafIcon size={14} />,
    color: "#1a9e4a",
    items: [
      { name: "Punjab Crops", lat: 30.9000, lon: 75.8500 },
      { name: "Valencia Rice Basin", lat: 39.3500, lon: -0.3300 },
    ],
  },
];

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
  }, [selectedLatLon, selectedSteps]);

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

          {/* Floating Cartographic Stamp */}
          <div className="absolute bottom-4 left-4 z-[900] pointer-events-none hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/15 text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SENTINEL-2 L2A BOA · COPERNICUS EMS</span>
            <span className="opacity-50">|</span>
            <span>1.28 KM FOOTPRINT</span>
          </div>
        </section>

        {/* Right: Floating Glass 3D Command Deck (HUD) */}
        <aside className="w-full lg:w-[420px] flex flex-col gap-4 overflow-y-auto pr-1 shrink-0">
          {/* Target Location Card */}
          <Card3D depth={6} className="p-4 glass-card bg-white/85">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <RadarReticleIcon size={16} className="text-[#0066cc]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
                  Mission Target Telemetry
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0066cc]/10 text-[#0066cc]">
                4× Super-Resolution
              </span>
            </div>

            {selectedLatLon ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 bg-[#f7f8fa] p-2.5 rounded-xl border border-[#dde3ed]">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#6b7a99]">Latitude</span>
                    <p className="text-base font-bold font-mono text-[#0066cc]">
                      {selectedLatLon.lat.toFixed(5)}°
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#6b7a99]">Longitude</span>
                    <p className="text-base font-bold font-mono text-[#0066cc]">
                      {selectedLatLon.lon.toFixed(5)}°
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6b7a99]">
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/70 border border-[#dde3ed]">
                    <span>LR Input:</span>
                    <strong className="text-[#1a1f2e] font-mono">128px @ {LR_RES_M}m</strong>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/70 border border-[#dde3ed]">
                    <span>SR Output:</span>
                    <strong className="text-[#0066cc] font-mono">512px @ {SR_RES_M}m</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#6b7a99] bg-[#f7f8fa] rounded-xl">
                Click anywhere on the satellite map to acquire target coordinates.
              </div>
            )}
          </Card3D>

          {/* Curated Global Event Hotspots */}
          <Card3D depth={6} className="p-4 glass-card bg-white/85">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
                Global Event Scenarios
              </span>
              <span className="text-[10px] text-[#6b7a99]">1-Tap Snap</span>
            </div>

            <div className="space-y-2.5">
              {GLOBAL_EVENT_PRESETS.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1a1f2e] mb-1.5">
                    <span style={{ color: cat.color }}>{cat.icon}</span>
                    <span>{cat.category}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.items.map((item) => {
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#0066cc] text-white shadow-xs"
                              : "bg-white/80 hover:bg-white text-[#1a1f2e] border border-[#dde3ed]"
                          }`}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card3D>

          {/* Diffusion Quality Selector */}
          <Card3D depth={6} className="p-4 glass-card bg-white/85">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#6b7a99]">
                <Settings2 size={13} className="text-[#0066cc]" />
                <span>Inference Steps (Quality)</span>
              </div>
              <span className="text-[10px] font-mono text-[#0066cc]">
                {selectedSteps} DDIM
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {QUALITY_TIERS.map((tier) => (
                <button
                  key={tier.steps}
                  onClick={() => setSelectedSteps(tier.steps)}
                  disabled={isRunning}
                  className={`p-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                    selectedSteps === tier.steps
                      ? "bg-[#0066cc] text-white shadow-xs"
                      : "bg-white/70 hover:bg-white text-[#6b7a99] border border-[#dde3ed]"
                  }`}
                >
                  <div className="font-bold">{tier.steps} Steps</div>
                  <div className={`text-[10px] ${selectedSteps === tier.steps ? "text-white/80" : "text-[#6b7a99]"}`}>
                    {tier.approxTime}
                  </div>
                </button>
              ))}
            </div>
          </Card3D>

          {/* Status & Error Notification */}
          <AnimatePresence>
            {jobStatus && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl glass-card bg-white/90"
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

          {/* 3D Liquid Run Super-Resolution Submit Button */}
          <motion.button
            onClick={handleSubmit}
            disabled={!selectedLatLon || isRunning || submitting}
            whileHover={!selectedLatLon || isRunning ? {} : { scale: 1.02 }}
            whileTap={!selectedLatLon || isRunning ? {} : { scale: 0.98 }}
            className={`mt-auto relative w-full py-3.5 px-5 rounded-2xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !selectedLatLon || isRunning
                ? "bg-[#dde3ed] text-[#6b7a99] cursor-not-allowed shadow-none"
                : "bg-gradient-to-r from-[#0066cc] via-[#0052a3] to-[#0066cc] text-white shadow-[#0066cc]/30 hover:shadow-xl hover:shadow-[#0066cc]/40"
            }`}
          >
            {submitting || isRunning ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                />
                <span>{isRunning ? "Running 4× Super-Resolution…" : "Submitting Task…"}</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Deploy 4× Super-Resolution</span>
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
