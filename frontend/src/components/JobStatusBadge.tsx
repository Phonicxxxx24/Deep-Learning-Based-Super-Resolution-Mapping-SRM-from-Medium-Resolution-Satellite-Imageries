"use client";

import { motion } from "framer-motion";
import type { JobStatus } from "@/types";

const config: Record<JobStatus, { label: string; color: string; pulse: boolean }> = {
  queued:  { label: "Queued",     color: "#e8850a", pulse: false },
  running: { label: "Processing", color: "#0066cc", pulse: true  },
  done:    { label: "Done",       color: "#1a9e4a", pulse: false },
  error:   { label: "Error",      color: "#d93025", pulse: false },
};

export default function JobStatusBadge({
  status,
  msg,
}: {
  status: JobStatus;
  msg?: string | null;
}) {
  const { label, color, pulse } = config[status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
      style={{
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
      }}
    >
      <motion.span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
        animate={pulse ? { opacity: [1, 0.3, 1] } : {}}
        transition={pulse ? { repeat: Infinity, duration: 1.4 } : {}}
      />
      {msg ?? label}
    </motion.div>
  );
}
