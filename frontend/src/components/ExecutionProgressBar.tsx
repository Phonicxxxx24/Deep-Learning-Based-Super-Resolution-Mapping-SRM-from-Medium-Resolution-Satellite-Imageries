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
  modelChoice?: string;
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
    name: "Sen2SR-RRDB Neural Inference",
    shortLabel: "Inference",
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
  modelChoice = "able",
  className = "",
}: ExecutionProgressBarProps) {
  const [displayPct, setDisplayPct] = useState<number>(() => {
    if (status === "done") return 100;
    if (typeof pct === "number" && pct > 0) return pct;
    if (status === "queued") return 0;
    return 12;
  });

  const [localSeconds, setLocalSeconds] = useState<number>(() => elapsedSeconds ?? 0);

  useEffect(() => {
    if (typeof elapsedSeconds === "number") {
      setLocalSeconds(elapsedSeconds);
    }
  }, [elapsedSeconds]);

  useEffect(() => {
    if (status === "running" || status === "queued") {
      const timer = setInterval(() => {
        setLocalSeconds((s) => parseFloat((s + 0.1).toFixed(1)));
      }, 100);
      return () => clearInterval(timer);
    }
  }, [status]);

  // Smooth continuous progress calculation
  const targetPct = useMemo(() => {
    if (status === "done") return 100;
    if (status === "queued") return 0;
    if (typeof pct === "number" && pct > 0) return pct;

    if (stage === "export") return 92;
    if (stage === "indices") return 86;
    if (stage === "uncertainty") return 78;
    if (stage === "diffusion") return 60;
    if (stage === "preprocessing") return 38;
    if (stage === "acquisition") return 22;
    return 15;
  }, [status, pct, stage]);

  useEffect(() => {
    if (status === "done") {
      setDisplayPct(100);
      return;
    }
    if (status !== "running") return;

    const interval = setInterval(() => {
      setDisplayPct((prev) => {
        if (prev < targetPct) {
          const step = Math.max(0.4, (targetPct - prev) * 0.2);
          return Math.min(targetPct, prev + step);
        }
        // Micro-increment during network/GPU waiting so progress never looks frozen
        if (prev < 95) {
          return prev + 0.1;
        }
        return prev;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [status, targetPct]);

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
        className={`p-4 rounded-2xl flex flex-col gap-3 font-mono ${className}`}
        style={{ background: "#0a0a0a", border: "1px solid #222222", color: "#f5f5f5" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">
              GPU Serialization Buffer
            </span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold"
            style={{ background: "#1a1a1a", border: "1px solid #333333", color: "#ffffff" }}
          >
            Queue #{queuePos ?? 1}
          </div>
        </div>

        {/* Indeterminate track */}
        <div className="w-full h-1.5 rounded-full overflow-hidden relative" style={{ background: "#1a1a1a" }}>
          <motion.div
            className="h-full bg-white rounded-full w-1/3"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#888] font-mono">
          <span className="truncate">
            {msg ?? "Awaiting GPU executor allocation for single-job VRAM isolation…"}
          </span>
          <span className="tabular-nums font-semibold shrink-0 ml-2 text-white">
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
        className={`p-4 rounded-2xl flex flex-col gap-2.5 font-mono ${className}`}
        style={{ background: "#180a0a", border: "1px solid #7f1d1d", color: "#f87171" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-200">
              Pipeline Execution Terminated
            </span>
          </div>
          <span className="text-[11px] font-mono font-semibold text-red-400">
            {localSeconds.toFixed(1)}s
          </span>
        </div>
        <p
          className="text-xs font-mono leading-relaxed p-2.5 rounded-lg border"
          style={{ background: "#0a0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}
        >
          {msg ?? "An unhandled exception occurred during pipeline execution."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-[26px] flex flex-col gap-3.5 transition-all font-sans ios-glass-card border border-white/15 text-white shadow-2xl ${className}`}
    >
      {/* Top Section: C-like Radial Progress Arc Gauge + Full Stage Visibility */}
      <div className="flex items-center gap-3.5">
        {/* C-like Radial Arc Gauge */}
        <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 96 96">
            {/* Background C-Arc Track */}
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="5.5"
              strokeDasharray="172.44 238.76"
              strokeLinecap="round"
              transform="rotate(140 48 48)"
            />
            {/* Active C-Arc Fill */}
            <motion.circle
              cx="48"
              cy="48"
              r="38"
              fill="none"
              stroke="#ffffff"
              strokeWidth="5.5"
              strokeDasharray="172.44 238.76"
              strokeDashoffset={172.44 * (1 - displayPct / 100)}
              strokeLinecap="round"
              transform="rotate(140 48 48)"
              style={{
                filter: "drop-shadow(0 0 6px rgba(255, 255, 255, 0.35))",
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </svg>

          {/* Center Telemetry inside the C Gauge */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pt-0.5">
            <span className="text-base font-extrabold font-mono text-white tabular-nums tracking-tight leading-none">
              {roundedPct}%
            </span>
            <span className="text-[9px] font-mono text-white/50 tabular-nums mt-0.5">
              {formattedTime}
            </span>
          </div>
        </div>

        {/* Stage Identification & Detailed Telemetry (Fully Visible - No Truncation) */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="relative flex h-2 w-2 shrink-0">
              {status === "running" ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              )}
            </span>
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-white/60">
              {status === "done" ? "COMPLETE" : `STAGE 0${Math.min(activeStageIndex + 1, 4)}/04`}
            </span>
            <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/15">
              {scaleFactor === 8 ? "8× Ultra-HD" : "4× Enhanced"} · {samplingSteps} DDIM
            </span>
          </div>

          {/* Full Stage Name */}
          <h4 className="text-sm font-bold text-white tracking-tight leading-snug">
            {status === "done" ? "Inference Finalized" : currentStageInfo.name}
          </h4>

          {/* Detailed Live Message — completely visible and readable */}
          <p className="text-[11px] font-mono text-white/70 leading-relaxed break-words">
            {msg ??
              (status === "running"
                ? (modelChoice === "diffusion"
                    ? `Executing multi-spectral latent diffusion (${samplingSteps} DDIM steps)…`
                    : "Executing Sen2SR-RRDB super-resolution neural inference…")
                : "All multi-spectral deliverables generated successfully.")}
          </p>
        </div>
      </div>

      {/* Connected 4-Stage Flow */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10 font-mono">
        {STAGES.map((s, idx) => {
          const isDone = activeStageIndex > idx || status === "done";
          const isCurrent = activeStageIndex === idx && status === "running";

          return (
            <div key={s.id} className="flex flex-col gap-1.5 min-w-0">
              {/* Connector line and node */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold font-mono transition-all ${
                    isDone || isCurrent
                      ? "bg-white text-black border border-white shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                      : "bg-white/10 text-white/40 border border-white/15"
                  }`}
                >
                  {isDone ? <Check size={10} strokeWidth={3} /> : idx + 1}
                </div>
                <div
                  className={`flex-1 h-[2px] rounded-full transition-all ${
                    isDone ? "bg-white" : isCurrent ? "bg-white/50" : "bg-white/10"
                  }`}
                />
              </div>

              {/* Stage label and subtitle */}
              <div className="min-w-0">
                <span
                  className={`text-[11px] font-semibold block truncate leading-tight tracking-tight font-sans ${
                    isCurrent || isDone ? "text-white font-bold" : "text-white/40"
                  }`}
                >
                  {s.shortLabel}
                </span>
                <span className="text-[9.5px] font-mono text-white/45 block truncate leading-tight mt-0.5">
                  {idx === 0
                    ? "10-Band STAC"
                    : idx === 1
                    ? "BOA Mask"
                    : idx === 2
                    ? (modelChoice === "diffusion" ? `${samplingSteps} DDIM` : "RRDB SR-Net")
                    : `${scaleFactor === 8 ? "0.625m" : "2.5m"} GeoTIFF`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
