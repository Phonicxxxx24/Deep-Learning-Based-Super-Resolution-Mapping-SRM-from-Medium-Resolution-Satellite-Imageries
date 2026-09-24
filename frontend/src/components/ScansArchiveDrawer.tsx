"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { X, Search, ExternalLink, MapPin } from "lucide-react";
import Card3D from "./Card3D";
import { DatabaseArchiveIcon } from "./GlobalIcons";
import type { ScanRecord } from "@/types";
import { staticUrl } from "@/utils/api";

interface ScansArchiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scans: ScanRecord[];
  onSelectScanCoordinates?: (lat: number, lon: number) => void;
}

const CATEGORIES = ["All", "Urban Growth", "Disaster & Floods", "Agriculture & Food Security", "Arid / Climate", "Custom Scan"];

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
}: ScansArchiveDrawerProps) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredScans = useMemo(() => {
    return scans.filter((s) => {
      const matchCat =
        selectedCategory === "All" ||
        (s.event_category && s.event_category.toLowerCase() === selectedCategory.toLowerCase());
      const query = searchQuery.toLowerCase().trim();
      const area = resolveAreaDisplay(s);
      const matchQuery =
        !query ||
        s.job_id.toLowerCase().includes(query) ||
        area.title.toLowerCase().includes(query) ||
        area.subtitle.toLowerCase().includes(query) ||
        (s.location_name && s.location_name.toLowerCase().includes(query));
      return matchCat && matchQuery;
    });
  }, [scans, selectedCategory, searchQuery]);

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
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:w-[480px] lg:w-[540px] flex flex-col overflow-hidden font-mono"
            style={{
              background: "#0a0a0a",
              borderLeft: "1px solid #1f1f1f",
              color: "#f5f5f5",
            }}
          >
            {/* Drawer Header */}
            <div
              className="p-5 flex items-center justify-between gap-3"
              style={{ background: "#0e0e0e", borderBottom: "1px solid #1f1f1f" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}
                >
                  <DatabaseArchiveIcon size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                    Processed Scans Archive
                  </h2>
                  <p className="text-[11px] text-[#777] font-mono tabular-nums">
                    Telemetry Database · {scans.length} verified AOI acquisitions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#888] hover:text-white transition-colors cursor-pointer"
                style={{ background: "#141414", border: "1px solid #252525" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Search and Filters */}
            <div
              className="p-4 space-y-3"
              style={{ background: "#0a0a0a", borderBottom: "1px solid #1f1f1f" }}
            >
              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                <input
                  id="scans-archive-search-input"
                  name="scansQuery"
                  type="text"
                  autoComplete="off"
                  aria-label="Search scans by name or job ID"
                  placeholder="Search by area name, region, or job ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs font-mono outline-none transition-all"
                  style={{
                    background: "#121212",
                    border: "1px solid #242424",
                    color: "#ffffff",
                  }}
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono">
                {CATEGORIES.map((cat) => {
                  const isSel = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className="px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-all cursor-pointer"
                      style={{
                        background: isSel ? "#ffffff" : "#121212",
                        color: isSel ? "#000000" : "#888888",
                        border: `1px solid ${isSel ? "#ffffff" : "#242424"}`,
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scans List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3" style={{ background: "#070707" }}>
              {filteredScans.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[#666]">
                  <DatabaseArchiveIcon size={36} className="mb-2 opacity-30 text-white" />
                  <p className="text-sm font-semibold text-white">No matching scans found</p>
                  <p className="text-xs mt-1 text-[#666]">Try modifying your query or category filter.</p>
                </div>
              ) : (
                filteredScans.map((scan) => {
                  const area = resolveAreaDisplay(scan);
                  return (
                    <Card3D
                      key={scan.job_id}
                      className="p-3.5 rounded-xl transition-all group font-mono"
                      style={{
                        background: "#0e0e0e",
                        border: "1px solid #1f1f1f",
                      }}
                    >
                      <div className="flex gap-3.5">
                        {/* Image Thumbnail */}
                        <div
                          className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0"
                          style={{ background: "#000", border: "1px solid #222" }}
                        >
                          <Image
                            src={staticUrl(scan.thumbnail_url || scan.sr_rgb_url || `/static/${scan.job_id}_sr_rgb.png`)}
                            alt={area.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            unoptimized
                          />
                          <span
                            className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: "rgba(0,0,0,0.85)", color: "#fff", border: "1px solid #333" }}
                          >
                            SRM
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="px-2 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wider truncate"
                                style={{ background: "#1a1a1a", color: "#bbb", border: "1px solid #2c2c2c" }}
                              >
                                {scan.event_category || "Planetary AOI"}
                              </span>
                              <span className="text-[10px] text-[#666] font-mono tabular-nums">
                                {scan.created_at ? new Date(scan.created_at).toLocaleDateString() : "Saved"}
                              </span>
                            </div>

                            <h3 className="text-xs font-bold text-white mt-1.5 truncate" title={area.title}>
                              {area.title}
                            </h3>

                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#888]">
                              <MapPin size={11} className="text-white/60 shrink-0" />
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
                              <span className="text-[#666]">
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
