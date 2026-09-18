"use client";

import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Clock,
  AlertTriangle,
  Layers,
  Cpu,
  Radio,
  FileCheck2,
  Terminal,
} from "lucide-react";
import type { JobStatus } from "@/types";

interface ExecutionProgressBarProps {
  status: JobStatus;
  msg?: string | null;
  pct?: number | null;
  stage?: string | null;
  elapsedSeconds?: number | null;
  queuePos?: number | null;
  samplingSteps?: number;
  scaleFactor?: number;
  className?: string;
}

interface StepInfo {
  id: string;
  name: string;
  shortLabel: string;
  minPct: number;
  maxPct: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STAGES: StepInfo[] = [
  {
    id: "acquisition",
    name: "STAC Scene Ingestion",
    shortLabel: "Ingestion",
    minPct: 0,
    maxPct: 28,
    icon: Radio,
  },
  {
    id: "preprocessing",
    name: "Radiometric Calibration",
    shortLabel: "Calibration",
    minPct: 28,
    maxPct: 44,
    icon: Layers,
  },
  {
    id: "diffusion",
    name: "Dual-Path Latent Diffusion",
    shortLabel: "Diffusion SR",
    minPct: 44,
    maxPct: 82,
    icon: Cpu,
  },
  {
    id: "export",
    name: "Spectral & GeoTIFF Export",
    shortLabel: "Deliverables",
    minPct: 82,
    maxPct: 100,
    icon: FileCheck2,
  },
];

export default function ExecutionProgressBar({
  status,
  msg,
  pct,
  stage,
  elapsedSeconds,
  queuePos,
  samplingSteps = 50,
  scaleFactor = 4,
  className = "",
}: ExecutionProgressBarProps) {
  // Smooth percentage interpolation
  const [displayPct, setDisplayPct] = useState<number>(() => {
    if (status === "done") return 100;
    if (typeof pct === "number") return pct;
    if (status === "queued") return 0;
    return 10;
  });

  // Local live stopwatch in seconds
  const [localSeconds, setLocalSeconds] = useState<number>(() => elapsedSeconds ?? 0);

  useEffect(() => {
    if (typeof elapsedSeconds === "number") {
      setLocalSeconds(elapsedSeconds);
    }
  }, [elapsedSeconds]);

  useEffect(() => {
    if (status !== "running" && status !== "queued") return;
    const timer = setInterval(() => {
      setLocalSeconds((prev) => +(prev + 0.1).toFixed(1));
    }, 100);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "done") {
      setDisplayPct(100);
      return;
    }
    if (status === "queued") {
      setDisplayPct(0);
      return;
    }
    if (typeof pct === "number") {
      setDisplayPct((prev) => Math.max(prev, pct));
    }
  }, [pct, status]);

  // Subtle creep during long diffusion iterations so the UI never feels frozen
  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(() => {
      setDisplayPct((curr) => {
        const ceiling = typeof pct === "number" ? Math.min(pct + 7, 96) : 85;
        return curr < ceiling ? curr + 0.4 : curr;
      });
    }, 700);
    return () => clearInterval(interval);
  }, [status, pct]);

  // Current active stage index (0 to 3)
  const activeStageIndex = useMemo(() => {
    if (status === "done") return 4;
    if (status === "queued") return 0;

    if (stage) {
      if (stage === "acquisition") return 0;
      if (stage === "preprocessing") return 1;
      if (stage === "diffusion" || stage === "uncertainty") return 2;
      if (stage === "indices" || stage === "export") return 3;
      if (stage === "done") return 4;
    }

    for (let i = 0; i < STAGES.length; i++) {
      if (displayPct < STAGES[i].maxPct) return i;
    }
    return 3;
  }, [stage, displayPct, status]);

  const roundedPct = Math.min(100, Math.max(0, Math.round(displayPct)));
  const currentStageInfo = STAGES[Math.min(activeStageIndex, 3)];

  // Formatted stopwatch string (e.g., "00:14.2")
  const formattedTime = useMemo(() => {
    const mins = Math.floor(localSeconds / 60);
    const secs = (localSeconds % 60).toFixed(1);
    const mm = mins.toString().padStart(2, "0");
    const ss = (parseFloat(secs) < 10 ? "0" : "") + secs;
    return `${mm}:${ss}`;
  }, [localSeconds]);

  // Queued View
  if (status === "queued") {
    return (
      <div
        className={`p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col gap-3 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              GPU Serialization Buffer
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-[11px] font-mono text-amber-800 font-semibold">
            Queue #{queuePos ?? 1}
          </div>
        </div>

        {/* Indeterminate smooth track */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full bg-linear-to-r from-amber-400 to-amber-500 rounded-full w-1/3"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span className="truncate">
            {msg ?? "Awaiting GPU executor allocation for single-job VRAM isolation…"}
          </span>
          <span className="tabular-nums font-semibold shrink-0 ml-2">
            {localSeconds.toFixed(1)}s
          </span>
        </div>
      </div>
    );
  }

  // Error View
  if (status === "error") {
    return (
      <div
        className={`p-4 rounded-2xl bg-red-50/80 border border-red-200 text-red-900 shadow-xs flex flex-col gap-2.5 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-900">
              Pipeline Execution Terminated
            </span>
          </div>
          <span className="text-[11px] font-mono font-semibold text-red-700">
            {localSeconds.toFixed(1)}s
          </span>
        </div>
        <p className="text-xs font-mono text-red-700 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-red-200/70">
          {msg ?? "An unhandled exception occurred during pipeline execution."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col gap-3.5 transition-all ${className}`}
    >
      {/* Telemetry Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            {status === "running" ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0066cc]" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            )}
          </span>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-slate-600 shrink-0">
              {status === "done" ? "COMPLETE" : `STAGE 0${Math.min(activeStageIndex + 1, 4)}/04`}
            </span>
            <span className="text-xs font-bold text-slate-900 truncate">
              {status === "done" ? "Inference Finalized" : currentStageInfo.name}
            </span>
          </div>
        </div>

        {/* Right Metric Cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 tabular-nums">
            <Clock size={11} className="text-slate-500" />
            <span>{formattedTime}</span>
          </div>
          <span className="text-sm font-mono font-bold text-[#0066cc] tabular-nums min-w-[36px] text-right">
            {roundedPct}%
          </span>
        </div>
      </div>

      {/* Precision Segmented Gauge Track */}
      <div className="relative w-full">
        {/* Background Track with milestone ticks */}
        <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
          {/* Active Fill with guaranteed solid CSS gradient */}
          <div
            className="h-full rounded-full transition-all duration-300 ease-out relative"
            style={{
              width: `${roundedPct}%`,
              background:
                status === "done"
                  ? "#059669"
                  : "linear-gradient(90deg, #0052cc 0%, #0066cc 60%, #0284c7 100%)",
            }}
          >
            {/* Soft inner glow on leading edge */}
            {status === "running" && roundedPct > 3 && (
              <div className="absolute top-0 right-0 bottom-0 w-3 bg-white/40 rounded-full blur-[1px]" />
            )}
          </div>
        </div>

        {/* Milestone Tick Marks (25%, 50%, 75%) */}
        <div className="absolute top-0 left-0 right-0 h-2 flex justify-between pointer-events-none px-[25%]">
          <div className="w-[1.5px] h-full bg-white/70" />
          <div className="w-[1.5px] h-full bg-white/70" />
        </div>
      </div>

      {/* Connected 4-Stage Horizontal Pipeline Flow */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        {STAGES.map((s, idx) => {
          const isDone = activeStageIndex > idx || status === "done";
          const isCurrent = activeStageIndex === idx && status === "running";

          return (
            <div key={s.id} className="flex flex-col gap-1.5 min-w-0">
              {/* Connector line and node */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold font-mono transition-all ${
                    isDone
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                      ? "bg-[#0066cc] text-white ring-3 ring-blue-100"
                      : "bg-slate-100 text-slate-500 border border-slate-200"
                  }`}
                >
                  {isDone ? <Check size={10} strokeWidth={3} /> : idx + 1}
                </div>
                <div
                  className={`flex-1 h-[2px] rounded-full ${
                    isDone
                      ? "bg-emerald-500/50"
                      : isCurrent
                      ? "bg-blue-200"
                      : "bg-slate-100"
                  }`}
                />
              </div>

              {/* Stage label and subtitle */}
              <div className="min-w-0">
                <span
                  className={`text-[10px] font-bold block truncate leading-tight ${
                    isCurrent
                      ? "text-[#0066cc]"
                      : isDone
                      ? "text-slate-800"
                      : "text-slate-500"
                  }`}
                >
                  {s.shortLabel}
                </span>
                <span className="text-[9px] font-mono text-slate-500 block truncate leading-tight mt-0.5">
                  {idx === 0
                    ? "10-Band STAC"
                    : idx === 1
                    ? "BOA Mask"
                    : idx === 2
                    ? `${samplingSteps} DDIM`
                    : `${scaleFactor === 8 ? "0.625m" : "2.5m"} GeoTIFF`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Telemetry Log & Activity Console */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 text-[11px] font-mono shadow-xs overflow-hidden">
        <div className="flex items-center gap-1.5 shrink-0">
          <Terminal size={12} className="text-emerald-400" />
          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
            {status === "done" ? "FINAL" : "EXEC"}
          </span>
        </div>

        <span className="truncate text-slate-300 flex-1">
          {msg ??
            (status === "running"
              ? `Processing multi-spectral latent diffusion (${samplingSteps} DDIM steps)…`
              : "All multi-spectral deliverables generated successfully.")}
        </span>

        <span className="text-[10px] text-slate-400 shrink-0 font-medium hidden sm:inline-block">
          {scaleFactor === 8 ? "8× Ultra-Res" : "4× Standard"}
        </span>
      </div>
    </div>
  );
}
