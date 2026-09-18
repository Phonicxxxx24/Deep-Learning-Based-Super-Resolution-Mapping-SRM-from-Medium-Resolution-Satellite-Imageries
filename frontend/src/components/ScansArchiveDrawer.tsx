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
  
  // If location has comma, e.g. "Rajkot Urban Area, Gujarat, India"
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

  // Fallback if legacy coordinates
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
          {/* Backdrop overlay — higher z-index than Leaflet (9998) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-xs transition-opacity"
          />

          {/* Slide-out Glass Drawer — strictly on top of map (9999) */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:w-[480px] lg:w-[540px] bg-white/95 backdrop-blur-2xl border-l border-[#dde3ed] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#dde3ed] flex items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0066cc]/10 border border-[#0066cc]/20 flex items-center justify-center text-[#0066cc]">
                  <DatabaseArchiveIcon size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Processed Scans Archive
                  </h2>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    Telemetry Database · {scans.length} verified AOI acquisitions
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-[#f0f2f5] hover:bg-[#dde3ed] flex items-center justify-center text-[#6b7a99] hover:text-[#1a1f2e] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="p-4 border-b border-[#dde3ed] bg-white/80 space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7a99]" />
                <input
                  type="text"
                  placeholder="Search by area name, region, or job ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white border border-[#dde3ed] text-[#1a1f2e] placeholder-[#6b7a99] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-[#0066cc] text-white shadow-xs"
                        : "bg-white text-[#6b7a99] border border-[#dde3ed] hover:border-[#0066cc]/40"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Scans List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#f7f8fa]/60">
              {filteredScans.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[#6b7a99]">
                  <DatabaseArchiveIcon size={36} className="mb-2 opacity-40 text-[#0066cc]" />
                  <p className="text-sm font-semibold text-[#1a1f2e]">No matching scans found</p>
                  <p className="text-xs mt-1">Try changing your search query or category filter.</p>
                </div>
              ) : (
                filteredScans.map((scan) => {
                  const area = resolveAreaDisplay(scan);
                  return (
                    <Card3D
                      key={scan.job_id}
                      className="p-3.5 bg-white border border-[#dde3ed] hover:border-[#0066cc]/40 shadow-xs hover:shadow-md transition-all group"
                    >
                      <div className="flex gap-3.5">
                        {/* Image Thumbnail */}
                        <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-[#dde3ed]">
                          <Image
                            src={staticUrl(scan.thumbnail_url || scan.sr_rgb_url || `/static/${scan.job_id}_sr_rgb.png`)}
                            alt={area.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            unoptimized
                          />
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/75 text-white backdrop-blur-xs">
                            2.5m SR
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#0066cc]/10 text-[#0066cc] truncate">
                                {scan.event_category || "Planetary Scan"}
                              </span>
                              <span className="text-[10px] text-[#6b7a99] font-mono">
                                {scan.created_at ? new Date(scan.created_at).toLocaleDateString() : "Historical"}
                              </span>
                            </div>

                            {/* Area Name prominently displayed */}
                            <h3 className="text-xs font-bold text-[#1a1f2e] mt-1.5 truncate" title={area.title}>
                              {area.title}
                            </h3>

                            {/* Geographic Region */}
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#6b7a99]">
                              <MapPin size={11} className="text-[#0066cc] shrink-0" />
                              <span className="truncate font-medium" title={area.subtitle}>
                                {area.subtitle}
                              </span>
                            </div>
                          </div>

                          {/* Metrics Bar */}
                          <div className="mt-2 pt-2 border-t border-[#dde3ed] flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-2 font-medium">
                              <span className="text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">
                                {scan.preservation_pct ? `${scan.preservation_pct.toFixed(1)}% Fidelity` : "✓ Preserved"}
                              </span>
                              <span className="text-[#6b7a99]">
                                {scan.sampling_steps} DDIM
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {onSelectScanCoordinates && (
                                <button
                                  onClick={() => {
                                    onSelectScanCoordinates(scan.lat, scan.lon);
                                    onClose();
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-[#f0f2f5] hover:bg-[#dde3ed] text-[#1a1f2e] transition-colors cursor-pointer"
                                >
                                  Locate
                                </button>
                              )}

                              <Link
                                href={`/results/${scan.job_id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-[#0066cc] text-white hover:bg-[#0052a3] transition-colors"
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
