"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Database, Sparkles, Navigation, Globe, Radio } from "lucide-react";
import { RadarReticleIcon } from "./GlobalIcons";

interface CommandHeaderProps {
  totalScans: number;
  onOpenArchive: () => void;
  onSearchCoordinates?: (lat: number, lon: number) => void;
}

const QUICK_CHIPS = [
  { name: "Mumbai", lat: 18.9600, lon: 72.8200 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Grand Canyon", lat: 36.1069, lon: -112.1129 },
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
];

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
      setSearchInput("");
    }
  };

  return (
    <header
      className="w-full z-40 select-none font-mono shrink-0"
      style={{
        background: "#080808",
        borderBottom: "1px solid #1a1a1a",
      }}
    >
      <div className="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Brand Identification */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-8 h-8 rounded-xl overflow-hidden bg-black border border-[#262626] p-0.5 group-hover:border-[#444] transition-colors shrink-0">
              <Image
                src="/beyond-pixels-icon.png"
                alt="Beyond Pixels Logo"
                width={30}
                height={30}
                className="w-full h-full object-contain rounded-lg"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white tracking-tight uppercase">
                  Beyond Pixels
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#141414] text-white border border-[#2a2a2a]">
                  Studio v2.4
                </span>
              </div>
              <p className="text-[10px] text-[#666] leading-none mt-0.5">
                Copernicus Sentinel-2 Deep Super-Resolution Mapping
              </p>
            </div>
          </Link>
        </div>

        {/* Center: Search & Quick Jumps Capsule (like Image 1 & 3) */}
        <div className="flex-1 max-w-xl mx-2 hidden md:flex items-center gap-2">
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 relative flex items-center"
          >
            <Search
              size={13}
              className="absolute left-3.5 text-[#666] pointer-events-none"
            />
            <input
              id="coordinates-search-input"
              name="coordinates"
              type="text"
              autoComplete="off"
              aria-label="Search coordinates"
              placeholder="Search coordinates e.g. 18.96, 72.82 or paste lat, lon…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-20 py-2 rounded-2xl text-xs bg-[#111111] text-white border border-[#222222] focus:border-[#555] transition-all outline-none placeholder:text-[#555]"
            />
            <button
              type="submit"
              className="btn-white absolute right-1.5 px-3 py-1 rounded-xl text-[10px] font-bold bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              Locate
            </button>
          </form>

          {/* Quick preset chips */}
          <div className="hidden lg:flex items-center gap-1">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.name}
                type="button"
                onClick={() => onSearchCoordinates?.(chip.lat, chip.lon)}
                className="px-2.5 py-1 rounded-xl text-[10px] bg-[#121212] hover:bg-[#1f1f1f] text-[#888] hover:text-white border border-[#222] transition-colors cursor-pointer"
              >
                {chip.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Telemetry & Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Status pill: GPU Ready */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0f0f0f] border border-[#202020] text-xs">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white">
              GPU Engine Ready
            </span>
          </div>

          {/* Status pill: Model Target */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0f0f0f] border border-[#202020] text-xs">
            <Sparkles size={12} className="text-white" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#aaa]">
              10m → <span className="text-white font-bold">0.625m (8×)</span>
            </span>
          </div>

          {/* Scans Archive Button */}
          <button
            type="button"
            onClick={onOpenArchive}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#141414] hover:bg-[#1e1e1e] text-white border border-[#282828] hover:border-[#444] transition-all cursor-pointer text-xs font-semibold"
          >
            <Database size={13} className="text-[#888]" />
            <span>Mission Archive</span>
            <span className="px-1.5 py-0.2 rounded-md bg-[#222] text-[10px] text-white font-bold tabular-nums">
              {totalScans}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
