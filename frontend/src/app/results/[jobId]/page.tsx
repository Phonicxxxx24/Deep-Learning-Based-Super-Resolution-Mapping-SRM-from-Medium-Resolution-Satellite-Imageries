"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getJobStatus, getJobResult } from "@/utils/api";
import ResultsPanel from "@/components/ResultsPanel";
import JobStatusBadge from "@/components/JobStatusBadge";
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
        // Transient network glitch while polling — keep polling until terminal state
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
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <LiquidBackdrop />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5 text-center max-w-lg w-full p-6 sm:p-8 rounded-2xl glass-card bg-white/95 shadow-xl border border-slate-200"
      >
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
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-500">
              <AlertTriangle size={20} />
            </div>
            <p className="text-sm font-medium text-red-600">
              {error}
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200"
            >
              <ArrowLeft size={14} /> Return to map
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1 text-center">
            <p className="text-xs text-slate-500">
              Super-resolution mapping inference is actively processing on the GPU.
            </p>
            <p className="text-[11px] font-mono text-slate-400">
              Job ID: <span className="text-[#0066cc] font-semibold">{jobId}</span>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
