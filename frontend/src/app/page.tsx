"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  Clock,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";

import CommandHeader from "@/components/CommandHeader";
import ScansArchiveDrawer from "@/components/ScansArchiveDrawer";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import SpecsModal from "@/components/SpecsModal";
import ExecutionProgressBar from "@/components/ExecutionProgressBar";
import QuickPresetsSidebar from "@/components/QuickPresetsSidebar";
import { submitSRJob, getJobStatus, getPastScans, staticUrl, deleteScanRecord, clearAllScans } from "@/utils/api";
import {
  POLL_INTERVAL_MS,
  QUALITY_TIERS,
  type QualityTierSteps,
  NOTABLE_LOCATIONS,
} from "@/lib/constants";
import type { JobStatus, StatusResponse, ScanRecord } from "@/types";

/* ── Dynamic import for 2D High-Res Satellite Surface (Client side only) ── */
const MapPicker = dynamic(
  () => import("@/components/MapPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#06080e]">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-xs text-white/60 tracking-wide font-sans">
          Loading High-Resolution Satellite Surface…
        </span>
      </div>
    ),
  }
);

export default function HomePage() {
  const router = useRouter();

  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>({
    lat: 18.9600,
    lon: 72.8200,
  });
  const [selectedLocName, setSelectedLocName] = useState<string | null>("Mumbai Harbour, India");

  const [jobId,          setJobId]          = useState<string | null>(null);
  const [jobStatus,      setJobStatus]      = useState<JobStatus | null>(null);
  const [statusMsg,      setStatusMsg]      = useState<string | null>(null);
  const [progressPct,    setProgressPct]    = useState<number | null>(null);
  const [currentStage,   setCurrentStage]   = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [queuePos,       setQueuePos]       = useState<number | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const [selectedSteps, setSelectedSteps] = useState<QualityTierSteps>(50);
  const [scaleFactor,   setScaleFactor]   = useState<number>(4);

  const [archiveOpen,      setArchiveOpen]      = useState(false);
  const [specsOpen,        setSpecsOpen]        = useState(false);
  const [inspectorFolded,  setInspectorFolded]  = useState(false);
  const [pastScans,        setPastScans]        = useState<ScanRecord[]>([]);

  /* ── Load past scans ──────────────────────────────────────────────────── */
  useEffect(() => {
    getPastScans({ limit: 50 })
      .then((res) => { if (res?.scans) setPastScans(res.scans); })
      .catch((err) => console.warn("Past scans load failed:", err));
  }, []);

  const [confirmClearMissions, setConfirmClearMissions] = useState(false);

  // Auto-reset clear confirmation after 3s
  useEffect(() => {
    if (confirmClearMissions) {
      const t = setTimeout(() => setConfirmClearMissions(false), 3000);
      return () => clearTimeout(t);
    }
  }, [confirmClearMissions]);

  const handleDeleteMission = useCallback(async (e: React.MouseEvent, targetJobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPastScans((prev) => prev.filter((s) => s.job_id !== targetJobId));
    try {
      await deleteScanRecord(targetJobId);
    } catch (err) {
      console.error("Failed to delete mission:", err);
    }
  }, []);

  const handleClearAllMissions = useCallback(async () => {
    if (!confirmClearMissions) {
      setConfirmClearMissions(true);
      return;
    }
    setConfirmClearMissions(false);
    setPastScans([]);
    try {
      await clearAllScans();
    } catch (err) {
      console.error("Failed to clear missions:", err);
    }
  }, [confirmClearMissions]);

  /* ── Location Selection Handler ────────────────────────────────────────── */
  const handleLocationSelect = useCallback((lat: number, lon: number, name?: string) => {
    setSelectedLatLon({ lat, lon });
    if (name) {
      setSelectedLocName(name);
    } else {
      const match = NOTABLE_LOCATIONS.find(
        (loc) => Math.abs(loc.lat - lat) < 0.15 && Math.abs(loc.lon - lon) < 0.15
      );
      setSelectedLocName(match ? match.name : `Target AOI (${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"})`);
    }
    setError(null);
  }, []);

  /* ── Submit Pipeline Job ──────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!selectedLatLon) return;
    setSubmitting(true);
    setError(null);
    setProgressPct(0);
    setCurrentStage("queued");
    setElapsedSeconds(0);

    try {
      const res = await submitSRJob({
        lat:            selectedLatLon.lat,
        lon:            selectedLatLon.lon,
        n_uncertainty:  5,
        sampling_steps: selectedSteps,
        scale_factor:   scaleFactor,
        model_choice:   "able", // Sen2SR-RRDB neural model
      });

      setJobId(res.job_id);
      setJobStatus(res.status);
      setStatusMsg(res.progress_msg);
      setQueuePos(res.queue_position);
      if (typeof res.progress_pct === "number") setProgressPct(res.progress_pct);
      if (res.stage) setCurrentStage(res.stage);
      if (typeof res.elapsed_s === "number") setElapsedSeconds(res.elapsed_s);
      getPastScans({ limit: 50 }).then((r) => r && setPastScans(r.scans));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pipeline execution submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [selectedLatLon, selectedSteps, scaleFactor]);

  /* ── Polling ───────────────────────────────────────────────────────────── */
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
          setError(s.progress_msg ?? "Pipeline failed during execution");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Polling connection error");
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId, jobStatus, router]);

  const isRunning = jobStatus === "queued" || jobStatus === "running";
  const isProcessing = isRunning || submitting;

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans select-none bg-[#06080e] text-white">
      {/* Dynamic Ambient Liquid Glow Backdrop */}
      <LiquidBackdrop />

      {/* ── BASE LEVEL: FULL-SCREEN SATELLITE MAP (100% Display Coverage) ── */}
      <div className="absolute inset-0 w-full h-full z-0">
        <MapPicker
          selectedPoint={selectedLatLon}
          onSelect={(lat, lon) => handleLocationSelect(lat, lon)}
          disabled={isRunning}
        />
      </div>

      {/* ── OVERLAY LEVEL 1: FLOATING TOP COMMAND HEADER ── */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <CommandHeader
          totalScans={pastScans.length}
          onOpenArchive={() => setArchiveOpen(true)}
          onSearchCoordinates={(lat, lon) => handleLocationSelect(lat, lon)}
          onOpenSpecs={() => setSpecsOpen(true)}
        />
      </div>

      {/* ── OVERLAY LEVEL 2: LEFT FLOATING QUICK PRESETS SIDEBAR ── */}
      <QuickPresetsSidebar
        selectedLocation={selectedLatLon}
        onSelectLocation={(lat, lon, name) => handleLocationSelect(lat, lon, name)}
        className="absolute top-20 left-4 sm:left-6 max-h-[calc(100vh-140px)]"
      />

      {/* ── OVERLAY LEVEL 3: FLOATING iOS LIQUID GLASS INSPECTOR SHEET ── */}
      <motion.aside
        initial={{ x: 36, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="absolute top-20 right-4 sm:right-6 bottom-4 w-[390px] xl:w-[420px] max-w-[calc(100vw-2rem)] z-20 pointer-events-auto flex flex-col gap-3 overflow-y-auto custom-scrollbar transition-all"
      >
        {/* Main Controls Glass Sheet */}
        <div className="p-5 rounded-[28px] flex flex-col gap-3.5 ios-glass-card shadow-2xl border border-white/15">
          {/* Header with Title and Collapse / Minimize Toggle */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center text-white">
                <MapPin size={15} />
              </div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/90">
                Target Observation Area
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={() => setInspectorFolded((prev) => !prev)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
                title={inspectorFolded ? "Expand Controls" : "Collapse for Map View"}
                aria-label="Toggle inspector view"
              >
                {inspectorFolded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </motion.button>
            </div>
          </div>

          {/* Target Location & Coordinates Pill */}
          {selectedLatLon ? (
            <div className="p-3.5 rounded-2xl ios-glass-subtle flex flex-col gap-1.5 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-white/60">
                  Target Geographic Coordinates
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-mono">
                  1.28 × 1.28 km
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-semibold tracking-tight font-mono text-white tabular-nums">
                {Math.abs(selectedLatLon.lat).toFixed(4)}°{selectedLatLon.lat >= 0 ? "N" : "S"},{" "}
                {Math.abs(selectedLatLon.lon).toFixed(4)}°{selectedLatLon.lon >= 0 ? "E" : "W"}
              </div>
              {selectedLocName && (
                <div className="flex items-center gap-1.5 text-xs text-white/80 pt-1 border-t border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span className="truncate font-medium">{selectedLocName}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl ios-glass-subtle text-center text-xs text-white/60">
              Tap anywhere on the satellite surface to lock target coordinates
            </div>
          )}

          {/* Collapsible settings block */}
          <AnimatePresence initial={false}>
            {!inspectorFolded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                className="flex flex-col gap-3.5 overflow-hidden"
              >
                {/* Super-Resolution Scale Factor Setting (iOS Segmented Control with smooth sliding pill) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-white/70">Super-Resolution Scale</span>
                    <span className="font-mono text-[10px] text-white/50">
                      {scaleFactor === 8 ? "2048 × 2048 px" : "512 × 512 px"}
                    </span>
                  </div>
                  <div className="ios-segmented relative p-1">
                    {[
                      { factor: 4, label: "4× Enhanced", sub: "2.5m GSD" },
                      { factor: 8, label: "8× Ultra-HD", sub: "0.625m Sub-Metre" },
                    ].map(({ factor, label, sub }) => (
                      <button
                        key={factor}
                        type="button"
                        onClick={() => setScaleFactor(factor)}
                        disabled={isRunning}
                        className="relative flex-1 py-2 px-3 rounded-xl text-center cursor-pointer transition-colors"
                      >
                        {scaleFactor === factor && (
                          <motion.div
                            layoutId="activeScalePill"
                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                            className="absolute inset-0 bg-white/20 border border-white/25 rounded-xl backdrop-blur-md shadow-sm"
                          />
                        )}
                        <span className={`relative z-10 block font-semibold text-xs ${scaleFactor === factor ? "text-white" : "text-white/60 hover:text-white"}`}>
                          {label}
                        </span>
                        <span className={`relative z-10 text-[10px] block font-normal ${scaleFactor === factor ? "text-white/90" : "text-white/40"}`}>
                          {sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality Passes (iOS Segmented Control with smooth sliding pill) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-white/70">Inference Sampling Passes</span>
                    <span className="font-mono text-[10px] text-white/50">
                      {selectedSteps} passes ({selectedSteps === 50 ? "~4s" : selectedSteps === 100 ? "~6s" : "~8s"})
                    </span>
                  </div>
                  <div className="ios-segmented relative p-1">
                    {QUALITY_TIERS.slice(0, 3).map((tier) => (
                      <button
                        key={tier.steps}
                        type="button"
                        onClick={() => setSelectedSteps(tier.steps)}
                        disabled={isRunning}
                        className="relative flex-1 py-1.5 px-2 rounded-xl text-center cursor-pointer transition-colors"
                      >
                        {selectedSteps === tier.steps && (
                          <motion.div
                            layoutId="activeTierPill"
                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                            className="absolute inset-0 bg-white/20 border border-white/25 rounded-xl backdrop-blur-md shadow-sm"
                          />
                        )}
                        <span className={`relative z-10 block font-semibold text-xs ${selectedSteps === tier.steps ? "text-white" : "text-white/60 hover:text-white"}`}>
                          {tier.label}
                        </span>
                        <span className={`relative z-10 text-[10px] block font-mono ${selectedSteps === tier.steps ? "text-white/90" : "text-white/40"}`}>
                          {tier.steps} steps
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary iOS Liquid Action Button */}
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedLatLon || isRunning || submitting}
            whileHover={!selectedLatLon || isRunning ? {} : { scale: 1.01 }}
            whileTap={!selectedLatLon || isRunning ? {} : { scale: 0.98 }}
            className={`w-full py-3.5 px-5 rounded-2xl text-xs sm:text-sm font-semibold tracking-wide transition-all flex items-center justify-center gap-2 shadow-2xl cursor-pointer ${
              !selectedLatLon || isRunning
                ? "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
                : "ios-btn-primary"
            }`}
          >
            {submitting || isRunning ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 rounded-full border-2 border-white border-t-transparent"
                />
                <span>Reconstructing Sentinel-2 Tile…</span>
              </>
            ) : (
              <>
                <span>Enhance Satellite Resolution ({scaleFactor}×)</span>
                <ArrowRight size={15} />
              </>
            )}
          </motion.button>

          {/* In-Flight Pipeline Execution Progress Bar */}
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
                  modelChoice="able"
                />
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-3.5 rounded-2xl text-xs leading-relaxed bg-red-500/10 border border-red-500/30 text-red-300"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recent Missions Shelf (Automatically removed from screen when processing starts) */}
        <AnimatePresence>
          {!isProcessing && pastScans.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 12, height: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="p-4 rounded-[26px] flex flex-col gap-2.5 ios-glass-card shadow-xl border border-white/12 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-white/60" />
                  <h3 className="text-xs font-semibold text-white/90">
                    Recent Missions
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {pastScans.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllMissions}
                      className={`text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 px-2 py-0.5 rounded-full ${
                        confirmClearMissions
                          ? "bg-white text-black font-semibold shadow-xs"
                          : "text-white/50 hover:text-white hover:bg-white/10"
                      }`}
                      title="Clear all recent missions"
                    >
                      <Trash2 size={11} />
                      <span>{confirmClearMissions ? "Confirm?" : "Clear"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setArchiveOpen(true)}
                    className="text-[11px] text-white/70 hover:text-white font-medium transition-colors cursor-pointer"
                  >
                    View All ({pastScans.length})
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {pastScans.slice(0, 3).map((scan) => (
                  <div
                    key={scan.job_id}
                    className="p-2.5 rounded-2xl ios-glass-subtle hover:bg-white/10 transition-all flex items-center justify-between gap-2 group/item"
                  >
                    <Link
                      href={`/results/${scan.job_id}`}
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-black/80 border border-white/20 shrink-0 relative flex items-center justify-center group-hover/item:border-white/40 transition-colors shadow-inner">
                        <Image
                          src={staticUrl(scan.thumbnail_url || scan.sr_rgb_url || scan.lr_rgb_url || `/static/${scan.job_id}_sr_rgb.png`)}
                          alt={scan.location_name || "Mission AOI"}
                          fill
                          className="object-cover group-hover/item:scale-110 transition-transform duration-300"
                          unoptimized
                        />
                        <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[7.5px] font-mono font-bold bg-black/90 text-white/90 border border-white/25 leading-none">
                          {scan.scale_factor ? `${scan.scale_factor}×` : "4×"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-white group-hover/item:text-white truncate block">
                          {scan.location_name || `Scan ${scan.job_id.slice(0, 8)}`}
                        </span>
                        <span className="text-[10px] text-white/50 block font-mono">
                          {scan.scale_factor ? `${scan.scale_factor}× SR` : "8× SR"} · {scan.processing_time_s ? `${scan.processing_time_s.toFixed(1)}s` : "Done"}
                        </span>
                      </div>
                    </Link>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteMission(e, scan.job_id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/15 transition-all cursor-pointer"
                        title="Remove this mission"
                        aria-label="Remove mission"
                      >
                        <Trash2 size={12} />
                      </button>
                      <Link
                        href={`/results/${scan.job_id}`}
                        className="p-1 text-white/40 group-hover/item:text-white transition-colors cursor-pointer"
                        aria-label="Inspect mission"
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {/* Scans Archive Modal Drawer */}
      <ScansArchiveDrawer
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        scans={pastScans}
        onSelectScanCoordinates={(lat, lon) => {
          handleLocationSelect(lat, lon);
          setArchiveOpen(false);
        }}
        onDeleteScan={(deletedId) => {
          setPastScans((prev) => prev.filter((s) => s.job_id !== deletedId));
        }}
        onClearAllScans={() => {
          setPastScans([]);
        }}
      />

      {/* System Specs & Spectral Fidelity Modal */}
      <SpecsModal
        isOpen={specsOpen}
        onClose={() => setSpecsOpen(false)}
      />
    </div>
  );
}
