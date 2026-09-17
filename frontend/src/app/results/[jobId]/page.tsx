"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getJobStatus, getJobResult } from "@/utils/api";
import ResultsPanel from "@/components/ResultsPanel";
import JobStatusBadge from "@/components/JobStatusBadge";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import type { SRResult, JobStatus } from "@/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

export default function ResultsPage() {
  const params = useParams();
  const jobId = typeof params?.jobId === "string" ? params.jobId : Array.isArray(params?.jobId) ? params.jobId[0] : "";
  
  const [status, setStatus] = useState<JobStatus>("queued");
  const [msg, setMsg] = useState<string | null>("Connecting to pipeline…");
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
        className="flex flex-col items-center gap-5 text-center max-w-md p-8 rounded-2xl glass-card bg-white/90 shadow-xl"
      >
        <JobStatusBadge status={status} msg={msg} />

        {error ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400">
              <AlertTriangle size={20} />
            </div>
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              <ArrowLeft size={14} /> Return to map
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
              The SR pipeline is running on the GPU. This page updates automatically.
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
              Job ID: <code className="font-mono text-[var(--color-accent)]">{jobId}</code>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
