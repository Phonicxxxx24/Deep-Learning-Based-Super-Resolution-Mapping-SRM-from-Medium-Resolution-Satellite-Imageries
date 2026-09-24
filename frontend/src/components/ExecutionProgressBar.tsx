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
    name: "Sen2SR Multi-Spectral SR",
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
  className = "",
}: ExecutionProgressBarProps) {
  const [displayPct, setDisplayPct] = useState<number>(() => {
    if (status === "done") return 100;
    if (typeof pct === "number") return pct;
    if (status === "queued") return 0;
    return 10;
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

  useEffect(() => {
    if (status === "done") {
      setDisplayPct(100);
      return;
    }
    if (typeof pct === "number") {
      setDisplayPct((prev) => Math.max(prev, pct));
      return;
    }
    if (status !== "running") return;

    const interval = setInterval(() => {
      setDisplayPct((prev) => {
        if (prev >= 95) return prev;
        const remaining = 95 - prev;
        const increment = Math.max(0.3, remaining * 0.05);
        return Math.min(95, prev + increment);
      });
    }, 700);
    return () => clearInterval(interval);
  }, [status, pct]);

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
      className={`p-4 rounded-2xl flex flex-col gap-3.5 transition-all font-mono ${className}`}
      style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", color: "#f5f5f5" }}
    >
      {/* Telemetry Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
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
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#888] shrink-0">
              {status === "done" ? "COMPLETE" : `STAGE 0${Math.min(activeStageIndex + 1, 4)}/04`}
            </span>
            <span className="text-xs font-bold text-white truncate">
              {status === "done" ? "Inference Finalized" : currentStageInfo.name}
            </span>
          </div>
        </div>

        {/* Right Metric Cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums"
            style={{ background: "#141414", border: "1px solid #282828", color: "#aaa" }}
          >
            <Clock size={11} className="text-[#888]" />
            <span>{formattedTime}</span>
          </div>
          <span className="text-sm font-mono font-bold text-white tabular-nums min-w-[36px] text-right">
            {roundedPct}%
          </span>
        </div>
      </div>

      {/* Segmented Gauge Track */}
      <div className="relative w-full">
        <div
          className="relative w-full h-2 rounded-full overflow-hidden"
          style={{ background: "#1a1a1a", border: "1px solid #282828" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out relative"
            style={{
              width: `${roundedPct}%`,
              background: "#ffffff",
            }}
          >
            {status === "running" && roundedPct > 3 && (
              <div className="absolute top-0 right-0 bottom-0 w-3 bg-white rounded-full blur-[1px]" />
            )}
          </div>
        </div>
      </div>

      {/* Connected 4-Stage Flow */}
      <div className="grid grid-cols-4 gap-2 pt-1 font-mono">
        {STAGES.map((s, idx) => {
          const isDone = activeStageIndex > idx || status === "done";
          const isCurrent = activeStageIndex === idx && status === "running";

          return (
            <div key={s.id} className="flex flex-col gap-1.5 min-w-0">
              {/* Connector line and node */}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold font-mono transition-all"
                  style={{
                    background: isDone || isCurrent ? "#ffffff" : "#141414",
                    color: isDone || isCurrent ? "#000000" : "#666666",
                    border: isDone || isCurrent ? "1px solid #ffffff" : "1px solid #282828",
                  }}
                >
                  {isDone ? <Check size={10} strokeWidth={3} /> : idx + 1}
                </div>
                <div
                  className="flex-1 h-[2px] rounded-full"
                  style={{
                    background: isDone ? "#ffffff" : isCurrent ? "#888888" : "#1a1a1a",
                  }}
                />
              </div>

              {/* Stage label and subtitle */}
              <div className="min-w-0">
                <span
                  className="text-[10px] font-bold block truncate leading-tight"
                  style={{
                    color: isCurrent || isDone ? "#ffffff" : "#666666",
                  }}
                >
                  {s.shortLabel}
                </span>
                <span className="text-[9px] font-mono text-[#555] block truncate leading-tight mt-0.5">
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

      {/* Live Telemetry Log Console */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-mono shadow-xs overflow-hidden"
        style={{ background: "#111111", border: "1px solid #222222", color: "#d4d4d4" }}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <Terminal size={12} className="text-white" />
          <span
            className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "#222222", color: "#ffffff" }}
          >
            {status === "done" ? "FINAL" : "EXEC"}
          </span>
        </div>

        <span className="truncate text-[#aaa] flex-1">
          {msg ??
            (status === "running"
              ? `Processing multi-spectral latent diffusion (${samplingSteps} DDIM steps)…`
              : "All multi-spectral deliverables generated successfully.")}
        </span>

        <span className="text-[10px] text-[#666] shrink-0 font-medium hidden sm:inline-block">
          {scaleFactor === 8 ? "8× Ultra-Res" : "4× Standard"}
        </span>
      </div>
    </div>
  );
}
