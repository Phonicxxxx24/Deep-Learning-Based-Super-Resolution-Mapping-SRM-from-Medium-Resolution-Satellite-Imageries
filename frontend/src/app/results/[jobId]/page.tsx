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
      className="relative min-h-screen flex flex-col items-center justify-center p-6 gap-6 font-sans text-white"
      style={{
        backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url('/results-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#06080e",
      }}
    >
      {/* High-Visibility Satellite Background Layer */}
      <div
        className="fixed inset-0 z-0 pointer-events-none bg-cover bg-no-repeat"
        style={{
          backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url('/results-bg.jpg')",
          backgroundPosition: "center top",
          backgroundAttachment: "fixed",
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="relative z-10 flex flex-col items-center gap-5 text-center max-w-lg w-full p-6 sm:p-8 rounded-[32px] ios-glass-card border border-white/15 shadow-2xl backdrop-blur-2xl"
      >
        {/* Beyond Pixels Branding Badge */}
        <div className="flex items-center gap-3 pb-3 w-full border-b border-white/10">
          <div className="relative w-12 h-12 shrink-0 filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
            <Image
              src="/beyond-pixels-icon.png"
              alt="Beyond Pixels Logo"
              fill
              className="object-contain"
            />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-white">
                Beyond Pixels
              </span>
            </div>
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
          <div className="flex flex-col items-center gap-3 mt-2 font-sans">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/15 text-red-400 border border-red-500/30">
              <AlertTriangle size={20} />
            </div>
            <p className="text-sm text-red-300">
              {error}
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer active:scale-95"
            >
              <ArrowLeft size={14} /> Return to Satellite Map
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1 text-center font-sans">
            <p className="text-xs text-white/60">
              Multi-spectral SRM pipeline is executing on dedicated GPU.
            </p>
            <p className="text-[11px] text-white/40 font-mono">
              Job ID: <span className="text-white font-medium">{jobId}</span>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
