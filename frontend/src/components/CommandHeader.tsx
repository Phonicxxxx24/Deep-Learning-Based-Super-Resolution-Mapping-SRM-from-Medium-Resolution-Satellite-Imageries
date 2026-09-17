"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Satellite3DIcon, DatabaseArchiveIcon, EarthGlobeIcon } from "./GlobalIcons";
import { Search, Radio, ShieldCheck } from "lucide-react";

interface CommandHeaderProps {
  totalScans: number;
  onOpenArchive: () => void;
  onSearchCoordinates?: (lat: number, lon: number) => void;
}

export default function CommandHeader({
  totalScans,
  onOpenArchive,
  onSearchCoordinates,
}: CommandHeaderProps) {
  const [utcTime, setUtcTime] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setUtcTime(
        now.toUTCString().slice(17, 25) + " UTC"
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    const parts = searchInput.split(/[, ]+/).map((s) => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      onSearchCoordinates?.(parts[0], parts[1]);
    }
  };

  return (
    <header className="w-full z-40 px-5 py-3 glass-panel border-b border-[#dde3ed]/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
      {/* Brand & Mission Identification */}
      <div className="flex items-center gap-3.5">
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#0066cc] to-[#0052a3] flex items-center justify-center text-white shadow-md shadow-[#0066cc]/25">
          <Satellite3DIcon size={22} className="text-white" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-[#1a1f2e]">
              SRM GLOBAL CRISIS WATCH
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0066cc]/10 text-[#0066cc] border border-[#0066cc]/20">
              SENTINEL-2 · 4×
            </span>
          </div>
          <p className="text-[11px] font-medium text-[#6b7a99] flex items-center gap-1.5">
            <EarthGlobeIcon size={12} />
            Planetary Super-Resolution Engine · 10m → 2.5m Ground Precision
          </p>
        </div>
      </div>

      {/* Center Search & Coordinates Jump */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md hidden md:flex items-center">
        <div className="relative w-full">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b7a99]" />
          <input
            type="text"
            placeholder="Jump to coordinates (e.g. 19.0760, 72.8777) or city..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-20 py-2 rounded-xl text-xs bg-white/90 border border-[#dde3ed] text-[#1a1f2e] placeholder-[#6b7a99] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30 focus:border-[#0066cc] transition-all shadow-2xs"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-[#f0f2f5] hover:bg-[#0066cc] text-[#1a1f2e] hover:text-white transition-all"
          >
            Locate
          </button>
        </div>
      </form>

      {/* Telemetry, Archive Drawer Trigger, & Live Status */}
      <div className="flex items-center gap-3">
        {/* UTC Clock */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 border border-[#dde3ed] text-[11px] font-mono font-medium text-[#1a1f2e] shadow-2xs">
          <Radio size={12} className="text-[#0066cc] animate-pulse" />
          <span>{utcTime || "SYNCING..."}</span>
        </div>

        {/* Global Scans Archive Trigger with Live Count */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenArchive}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-[#f7f8fa] border border-[#dde3ed] hover:border-[#0066cc]/40 text-[#1a1f2e] shadow-xs transition-all cursor-pointer"
        >
          <DatabaseArchiveIcon size={15} className="text-[#0066cc]" />
          <span>Scans Archive</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#0066cc] text-white">
            {totalScans}
          </span>
        </motion.button>

        {/* GPU Pipeline Ready Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-semibold text-emerald-700">
          <ShieldCheck size={13} />
          <span className="hidden sm:inline">GPU Cluster Ready</span>
        </div>
      </div>
    </header>
  );
}
