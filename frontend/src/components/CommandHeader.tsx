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
  const [searchInput, setSearchInput] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    const parts = searchInput.split(/[, ]+/).map((s) => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      onSearchCoordinates?.(parts[0], parts[1]);
    }
  };

  return (
    <header className="w-full z-40 px-5 py-3 glass-liquid-card border-b border-white/60 shadow-xs flex items-center justify-between gap-4">
      {/* Brand & Mission Identification */}
      <div className="flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#0066cc] to-[#0052a3] flex items-center justify-center text-white shadow-sm">
          <Satellite3DIcon size={19} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-[#1a1f2e] leading-tight">
            SRM Global Crisis Watch
          </h1>
          <p className="text-[11px] text-[#6b7a99] font-medium leading-tight">
            Planetary Super-Resolution & Radiometric Mapping
          </p>
        </div>
      </div>

      {/* Center Search & Coordinates Jump */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md hidden md:flex items-center">
        <div className="relative w-full">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b7a99]" />
          <input
            type="text"
            placeholder="Jump to coordinates (e.g. 19.0760, 72.8777)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-14 py-1.5 rounded-xl text-xs glass-liquid-inner text-[#1a1f2e] placeholder-[#6b7a99] focus:outline-none focus:ring-1 focus:ring-[#0066cc]/40 focus:border-[#0066cc] transition-all"
          />
          <button
            type="submit"
            className="absolute right-1 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-[#0066cc] hover:bg-[#0066cc]/10 transition-all cursor-pointer"
          >
            Locate
          </button>
        </div>
      </form>

      {/* Telemetry, Archive Drawer Trigger, & Live Status */}
      <div className="flex items-center gap-2.5">
        {/* Global Scans Archive Trigger */}
        <button
          onClick={onOpenArchive}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold glass-liquid-inner hover:bg-white text-[#1a1f2e] border border-white/60 shadow-2xs transition-all cursor-pointer"
        >
          <DatabaseArchiveIcon size={14} className="text-[#0066cc]" />
          <span>Archive</span>
          <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-[#0066cc] text-white">
            {totalScans}
          </span>
        </button>

        {/* Status Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-liquid-inner text-[11px] font-medium text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden sm:inline">Cluster Ready</span>
        </div>
      </div>
    </header>
  );
}
