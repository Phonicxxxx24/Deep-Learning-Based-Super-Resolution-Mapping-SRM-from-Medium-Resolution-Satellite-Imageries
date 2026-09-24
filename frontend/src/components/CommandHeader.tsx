"use client";

import React, { useState } from "react";
import Image from "next/image";
import { DatabaseArchiveIcon, RadarReticleIcon } from "./GlobalIcons";
import { Satellite } from "lucide-react";

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
    <header className="relative w-full z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)]">
      {/* Top Aerospace Optical Accent Strip */}
      <div className="h-[2px] w-full bg-linear-to-r from-[#0052cc] via-[#0284c7] via-60% to-[#10b981]" />

      <div className="w-full px-5 py-2.5 flex items-center justify-between gap-4">
        {/* Brand & Mission Identification */}
        <div className="flex items-center gap-3">
          {/* Beyond Pixels Mission Emblem */}
          <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-sm ring-1 ring-sky-400/30 bg-[#07101e] shrink-0 group">
            <Image
              src="/beyond-pixels-icon.png"
              alt="Beyond Pixels Logo"
              width={36}
              height={36}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              priority
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-slate-900 leading-none">
                Beyond Pixels
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider bg-[#0066cc]/10 text-[#0066cc] border border-[#0066cc]/20">
                v2.4 · SRM
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
              Sentinel-2 Super-Resolution Mapping · 10m → 2.5m
            </p>
          </div>
        </div>

        {/* Center Precision Search & Coordinate Navigator */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-lg hidden md:flex items-center">
          <div className="relative w-full group">
            <RadarReticleIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0066cc] transition-colors"
            />
            <input
              type="text"
              placeholder="Jump to coordinates (lat, lon) e.g. 28.6139, 77.2090..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-20 py-1.5 rounded-xl text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-200/90 focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/15 transition-all font-mono tabular-nums outline-none"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="submit"
                className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#0066cc] hover:bg-[#0066cc]/10 transition-all cursor-pointer"
              >
                Locate
              </button>
              <kbd className="hidden lg:inline-block text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200/80">
                ↵
              </kbd>
            </div>
          </div>
        </form>

        {/* Telemetry & Scans Vault Action Cluster */}
        <div className="flex items-center gap-2.5">
          {/* Live Copernicus STAC Stream Status */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-[11px] font-medium text-emerald-800 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="hidden sm:inline font-semibold">ESA Copernicus Hub</span>
            <span className="text-[9px] font-mono font-bold uppercase px-1 py-0.2 rounded bg-emerald-600/10 text-emerald-700">
              Online
            </span>
          </div>

          {/* Scans Archive Trigger */}
          <button
            onClick={onOpenArchive}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all cursor-pointer active:scale-98"
          >
            <DatabaseArchiveIcon size={14} className="text-[#0066cc]" />
            <span>Archive</span>
            <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
              {totalScans}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
