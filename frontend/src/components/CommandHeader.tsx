"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Database, Cpu } from "lucide-react";

interface CommandHeaderProps {
  totalScans: number;
  onOpenArchive: () => void;
  onSearchCoordinates?: (lat: number, lon: number) => void;
  onOpenSpecs?: () => void;
}


export default function CommandHeader({
  totalScans,
  onOpenArchive,
  onSearchCoordinates,
  onOpenSpecs,
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
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="w-full z-40 px-4 sm:px-6 pt-3 pb-2 select-none font-sans shrink-0 pointer-events-none"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 p-2 sm:px-4 sm:py-2.5 rounded-full ios-glass pointer-events-auto shadow-2xl">
        {/* Left: Brand Identification (Border removed, enlarged, subtext removed) */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="flex items-center gap-3 cursor-pointer group">
            <div className="w-11 h-11 relative shrink-0 transition-transform group-hover:scale-105 filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
              <Image
                src="/beyond-pixels-icon.png"
                alt="Beyond Pixels Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-white group-hover:text-white/90">
                Beyond Pixels
              </span>
            </div>
          </Link>
        </div>

        {/* Center: iOS Spotlight Search Capsule */}
        <div className="flex-1 max-w-lg mx-2 hidden md:flex items-center gap-2">
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 relative flex items-center"
          >
            <Search
              size={14}
              className="absolute left-3.5 text-white/40 pointer-events-none"
            />
            <input
              id="coordinates-search-input"
              name="coordinates"
              type="text"
              autoComplete="off"
              aria-label="Search coordinates or city"
              placeholder="Search coordinates e.g. 18.96, 72.82 or city…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-18 py-1.5 rounded-full text-xs bg-black/30 text-white border border-white/12 focus:border-white/50 focus:bg-black/50 transition-all outline-none placeholder:text-white/40 font-sans"
            />
            <motion.button
              whileTap={{ scale: 0.94 }}
              type="submit"
              className="absolute right-1 px-3 py-1 rounded-full text-[10px] font-semibold bg-white text-black hover:bg-white/90 transition-all cursor-pointer shadow-xs"
            >
              Locate
            </motion.button>
          </form>
        </div>

        {/* Right: Actions & Status */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Model Architecture Specs Button */}
          {onOpenSpecs && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={onOpenSpecs}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/12 text-white/80 hover:text-white border border-white/10 transition-all cursor-pointer text-xs font-medium"
              title="Sen2SR-RRDB Neural Engine Specifications"
            >
              <Cpu size={13} className="text-white" />
              <span>Specs</span>
            </motion.button>
          )}

          {/* Missions Archive Button */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={onOpenArchive}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/18 text-white border border-white/15 hover:border-white/25 transition-all cursor-pointer text-xs font-medium shadow-sm"
          >
            <Database size={13} className="text-white/70" />
            <span>Archive</span>
            {totalScans > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white text-black text-[10px] font-bold tabular-nums">
                {totalScans}
              </span>
            )}
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}
