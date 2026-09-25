"use client";

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { X, Search, ExternalLink, MapPin, Trash2 } from "lucide-react";
import Card3D from "./Card3D";
import { DatabaseArchiveIcon } from "./GlobalIcons";
import type { ScanRecord } from "@/types";
import { staticUrl, deleteScanRecord, clearAllScans } from "@/utils/api";

interface ScansArchiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scans: ScanRecord[];
  onSelectScanCoordinates?: (lat: number, lon: number) => void;
  onDeleteScan?: (jobId: string) => void;
  onClearAllScans?: () => void;
}



function resolveAreaDisplay(scan: ScanRecord): { title: string; subtitle: string } {
  const loc = scan.location_name || "";
  
  if (loc && !loc.startsWith("Scan (") && loc.includes(",")) {
    const parts = loc.split(",").map((s) => s.trim());
    return {
      title: parts[0],
      subtitle: parts.slice(1).join(", "),
    };
  }

  if (loc && !loc.startsWith("Scan (")) {
    return {
      title: loc,
      subtitle: "Verified Satellite AOI",
    };
  }

  const lat = scan.lat;
  const lon = scan.lon;
  if (21.5 <= lat && lat <= 23.0 && 70.0 <= lon && lon <= 71.5) {
    return { title: "Rajkot Urban Area", subtitle: "Gujarat, India" };
  } else if (22.5 <= lat && lat <= 23.5 && 72.0 <= lon && lon <= 73.2) {
    return { title: "Ahmedabad Metropolis", subtitle: "Gujarat, India" };
  } else if (18.5 <= lat && lat <= 19.5 && 72.5 <= lon && lon <= 73.5) {
    return { title: "Mumbai Coastal Area", subtitle: "Maharashtra, India" };
  } else if (30.0 <= lat && lat <= 31.0 && 78.5 <= lon && lon <= 80.5) {
    return { title: "Chamoli Glacial Valley", subtitle: "Uttarakhand, India" };
  } else if (26.5 <= lat && lat <= 27.5 && 70.5 <= lon && lon <= 71.5) {
    return { title: "Jaisalmer Solar Basin", subtitle: "Rajasthan, India" };
  } else if (28.3 <= lat && lat <= 28.9 && 76.8 <= lon && lon <= 77.5) {
    return { title: "Delhi NCR Urban Core", subtitle: "Delhi, India" };
  }

  return {
    title: `Area AOI (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
    subtitle: "Global Earth Observation",
  };
}

export default function ScansArchiveDrawer({
  isOpen,
  onClose,
  scans,
  onSelectScanCoordinates,
  onDeleteScan,
  onClearAllScans,
}: ScansArchiveDrawerProps) {

  const [searchQuery, setSearchQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletingJobIds, setDeletingJobIds] = useState<Set<string>>(new Set());

  // Auto-reset clear confirmation after 3s
  useEffect(() => {
    if (confirmClear) {
      const t = setTimeout(() => setConfirmClear(false), 3000);
      return () => clearTimeout(t);
    }
  }, [confirmClear]);

  const handleDelete = async (jobId: string) => {
    setDeletingJobIds((prev) => new Set(prev).add(jobId));
    try {
      await deleteScanRecord(jobId);
      onDeleteScan?.(jobId);
    } catch (err) {
      console.error("Failed to delete scan:", err);
    } finally {
      setDeletingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    try {
      await clearAllScans();
      onClearAllScans?.();
    } catch (err) {
      console.error("Failed to clear scans:", err);
    }
  };

  const filteredScans = useMemo(() => {
    return scans.filter((s) => {
      const query = searchQuery.toLowerCase().trim();
      const area = resolveAreaDisplay(s);
      return (
        !query ||
        s.job_id.toLowerCase().includes(query) ||
        area.title.toLowerCase().includes(query) ||
        area.subtitle.toLowerCase().includes(query) ||
        (s.location_name && s.location_name.toLowerCase().includes(query))
      );
    });
  }, [scans, searchQuery]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-xs transition-opacity"
          />

          {/* Slide-out Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:w-[480px] lg:w-[540px] flex flex-col overflow-hidden font-sans ios-glass-card border-l border-white/20 shadow-2xl"
          >
            {/* Drawer Header */}
            <div className="p-5 flex items-center justify-between gap-3 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white shadow-sm">
                  <DatabaseArchiveIcon size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-white">
                    Processed Missions Archive
                  </h2>
                  <p className="text-[11px] text-white/50 font-mono tabular-nums">
                    Telemetry Database · {scans.length} verified AOI acquisitions
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {scans.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      confirmClear
                        ? "bg-white text-black font-semibold shadow-xs"
                        : "text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10"
                    }`}
                    title="Remove all missions from archive"
                  >
                    <Trash2 size={12} />
                    <span className="whitespace-nowrap">{confirmClear ? "Confirm Clear All?" : "Clear All"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-white/10 bg-black/20">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  id="scans-archive-search-input"
                  name="scansQuery"
                  type="text"
                  autoComplete="off"
                  aria-label="Search scans by name or job ID"
                  placeholder="Search by area name, region, or job ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-full text-xs font-sans outline-none transition-all bg-white/5 border border-white/12 text-white placeholder:text-white/40 focus:border-white/50"
                />
              </div>
            </div>

            {/* Scans List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
              {filteredScans.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-white/50">
                  <DatabaseArchiveIcon size={36} className="mb-2 opacity-30 text-white" />
                  <p className="text-sm font-semibold text-white">No matching scans found</p>
                  <p className="text-xs mt-1 text-white/40">Try modifying your query or category filter.</p>
                </div>
              ) : (
                filteredScans.map((scan) => {
                  const area = resolveAreaDisplay(scan);
                  return (
                    <Card3D
                      key={scan.job_id}
                      className="p-3.5 rounded-2xl transition-all group font-sans ios-glass-subtle border border-white/12 hover:border-white/25"
                    >
                      <div className="flex gap-3.5">
                        {/* Cropped Satellite Map Scan Thumbnail */}
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-black/80 border border-white/20 shrink-0 relative flex items-center justify-center group-hover:border-white/40 transition-colors shadow-inner self-center">
                          <Image
                            src={staticUrl(scan.thumbnail_url || scan.sr_rgb_url || scan.lr_rgb_url || `/static/${scan.job_id}_sr_rgb.png`)}
                            alt={area.title}
                            fill
                            className="object-cover group-hover:scale-110 transition-transform duration-300"
                            unoptimized
                          />
                          <span className="absolute bottom-0.5 right-0.5 px-1 rounded text-[7.5px] font-mono font-bold bg-black/90 text-white/90 border border-white/25 leading-none">
                            {scan.scale_factor ? `${scan.scale_factor}×` : "4×"}
                          </span>
                        </div>

                        {/* Content */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            {/* Date only — no category tag */}
                            <div className="flex items-end justify-end">
                              <span className="text-[10px] text-white/40 font-mono tabular-nums">
                                {scan.created_at ? new Date(scan.created_at).toLocaleDateString() : "Saved"}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-white mt-0.5 truncate" title={area.title}>
                              {area.title}
                            </h3>

                            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-white/60">
                              <MapPin size={11} className="text-white/50 shrink-0" />
                              <span className="truncate font-medium" title={area.subtitle}>
                                {area.subtitle}
                              </span>
                            </div>
                          </div>

                          {/* Metrics Bar */}
                          <div
                            className="mt-2.5 pt-2 flex items-center justify-between text-[10px]"
                            style={{ borderTop: "1px solid #1a1a1a" }}
                          >
                            <div className="flex items-center gap-2 font-medium">
                              <span
                                className="px-1.5 py-0.5 rounded font-bold"
                                style={{ background: "#1c1c1c", color: "#f5f5f5", border: "1px solid #2e2e2e" }}
                              >
                                {scan.preservation_pct ? `${scan.preservation_pct.toFixed(1)}% Fidelity` : "10-Band SR"}
                              </span>
                              <span className="text-white/50">
                                {scan.sampling_steps} DDIM
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {onSelectScanCoordinates && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectScanCoordinates(scan.lat, scan.lon);
                                    onClose();
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
                                  style={{
                                    background: "#161616",
                                    color: "#f5f5f5",
                                    border: "1px solid #2c2c2c",
                                  }}
                                >
                                  Locate
                                </button>
                              )}

                              <Link
                                href={`/results/${scan.job_id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors"
                                style={{
                                  background: "#ffffff",
                                  color: "#000000",
                                  border: "1px solid #ffffff",
                                }}
                              >
                                <span>Inspect</span>
                                <ExternalLink size={10} />
                              </Link>

                              <button
                                type="button"
                                onClick={() => handleDelete(scan.job_id)}
                                disabled={deletingJobIds.has(scan.job_id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer bg-white/5 hover:bg-white/15 text-white/50 hover:text-white border border-white/10 disabled:opacity-50"
                                title="Remove mission"
                              >
                                <Trash2 size={10} />
                                <span>{deletingJobIds.has(scan.job_id) ? "..." : "Remove"}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card3D>
                  );
                })
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
