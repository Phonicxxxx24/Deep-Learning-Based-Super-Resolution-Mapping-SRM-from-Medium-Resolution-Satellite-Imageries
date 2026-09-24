"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getJobStatus, getJobResult } from "@/utils/api";
import ResultsPanel from "@/components/ResultsPanel";
import ExecutionProgressBar from "@/components/ExecutionProgressBar";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import type { SRResult, JobStatus } from "@/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

export default function ResultsPage() {
  const params = useParams();
  const jobId = typeof params?.jobId === "string" ? params.jobId : Array.isArray(params?.jobId) ? params.jobId[0] : "";
  
  const [status, setStatus] = useState<JobStatus>("queued");
  const [msg, setMsg] = useState<string | null>("Connecting to pipeline…");
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [result, setResult] = useState<SRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let isMounted = true;

    const fetchCurrent = async () => {
      try {
        const s = await getJobStatus(jobId);
        if (!isMounted) return;
        setStatus(s.status);
        setMsg(s.progress_msg);
        if (typeof s.progress_pct === "number") setProgressPct(s.progress_pct);
        if (s.stage) setStage(s.stage);
        if (typeof s.elapsed_s === "number") setElapsedSeconds(s.elapsed_s);
        setQueuePos(s.queue_position);

        if (s.status === "done") {
          const r = await getJobResult(jobId);
          if (isMounted) setResult(r);
        } else if (s.status === "error") {
          if (isMounted) setError(s.progress_msg ?? "Pipeline failed with an error");
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load job status");
      }
    };

    fetchCurrent();

    const interval = setInterval(async () => {
      try {
        const s = await getJobStatus(jobId);
        if (!isMounted) return;
        setStatus(s.status);
        setMsg(s.progress_msg);
        if (typeof s.progress_pct === "number") setProgressPct(s.progress_pct);
        if (s.stage) setStage(s.stage);
        if (typeof s.elapsed_s === "number") setElapsedSeconds(s.elapsed_s);
        setQueuePos(s.queue_position);

        if (s.status === "done") {
          clearInterval(interval);
          const r = await getJobResult(jobId);
          if (isMounted) setResult(r);
        } else if (s.status === "error") {
          clearInterval(interval);
          if (isMounted) setError(s.progress_msg ?? "Pipeline error");
        }
      } catch {
        // Transient network glitch while polling
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [jobId]);

  if (result) {
    return <ResultsPanel result={result} />;
  }

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center p-6 gap-6 font-mono"
      style={{ background: "#000000", color: "#f5f5f5" }}
    >
      <LiquidBackdrop />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5 text-center max-w-lg w-full p-6 sm:p-8 rounded-2xl shadow-2xl"
        style={{
          background: "#0a0a0a",
          border: "1px solid #1f1f1f",
        }}
      >
        {/* Beyond Pixels Branding Badge */}
        <div
          className="flex items-center gap-3 pb-3 w-full"
          style={{ borderBottom: "1px solid #1a1a1a" }}
        >
          <div
            className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0"
            style={{ background: "#000", border: "1px solid #2a2a2a" }}
          >
            <Image
              src="/beyond-pixels-icon.png"
              alt="Beyond Pixels Logo"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white">
                Beyond Pixels
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider"
                style={{ background: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a" }}
              >
                SRM Engine
              </span>
            </div>
            <p className="text-[11px] text-[#666] font-medium">
              Planetary Super-Resolution Mapping
            </p>
          </div>
        </div>

        <ExecutionProgressBar
          status={status}
          msg={msg}
          pct={progressPct}
          stage={stage}
          elapsedSeconds={elapsedSeconds}
          queuePos={queuePos}
          className="w-full text-left"
        />

        {error ? (
          <div className="flex flex-col items-center gap-3 mt-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400">
              <AlertTriangle size={20} />
            </div>
            <p className="text-sm font-mono text-red-400">
              {error}
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{
                background: "#141414",
                color: "#ffffff",
                border: "1px solid #2a2a2a",
              }}
            >
              <ArrowLeft size={14} /> Return to 3D Globe
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1 text-center font-mono">
            <p className="text-xs text-[#777]">
              Multi-spectral SRM pipeline is executing on dedicated GPU.
            </p>
            <p className="text-[11px] text-[#555]">
              Job ID: <span className="text-white font-semibold">{jobId}</span>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
