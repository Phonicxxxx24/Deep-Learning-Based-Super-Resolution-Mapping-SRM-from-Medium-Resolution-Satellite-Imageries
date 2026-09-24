"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Globe,
  Cpu,
  Activity,
  Database,
  Satellite,
  Settings,
  HelpCircle,
  X,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarNavProps {
  activeTab?: "globe" | "model" | "spectral" | "archive";
  onOpenArchive?: () => void;
  totalScans?: number;
}

export default function SidebarNav({
  activeTab = "globe",
  onOpenArchive,
  totalScans = 0,
}: SidebarNavProps) {
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [specModalOpen, setSpecModalOpen] = useState(false);

  return (
    <>
      <aside
        className="w-16 shrink-0 h-full flex flex-col items-center justify-between py-4 select-none z-30 font-mono"
        style={{
          background: "#080808",
          borderRight: "1px solid #1a1a1a",
        }}
      >
        {/* Top: Brand Avatar */}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/"
            className="group relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center p-1 transition-transform active:scale-95 cursor-pointer"
            style={{
              background: "#111111",
              border: "1px solid #282828",
            }}
            title="Beyond Pixels SRM Studio"
          >
            <Image
              src="/beyond-pixels-icon.png"
              alt="Beyond Pixels"
              width={34}
              height={34}
              className="w-full h-full object-contain rounded-lg"
              priority
            />
            {/* Live active dot */}
            <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-white ring-2 ring-black" />
          </Link>

          <div className="w-8 h-px bg-[#1e1e1e]" />
        </div>

        {/* Center: Main Navigation Dock Capsule */}
        <div
          className="flex flex-col items-center gap-2 p-1.5 rounded-2xl"
          style={{
            background: "#0e0e0e",
            border: "1px solid #1f1f1f",
          }}
        >
          {/* 1. 3D Globe Explorer */}
          <Link
            href="/"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
              activeTab === "globe"
                ? "bg-white text-black shadow-md font-bold"
                : "text-[#888888] hover:text-white hover:bg-[#1c1c1c]"
            }`}
            title="3D Satellite Globe Explorer"
          >
            <Globe size={18} />
            {/* Tooltip */}
            <span className="pointer-events-none absolute left-14 px-2.5 py-1 rounded-lg bg-[#141414] text-white border border-[#2a2a2a] text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
              3D Globe Explorer
            </span>
          </Link>

          {/* 2. Neural SR Model Architecture */}
          <button
            type="button"
            onClick={() => setModelModalOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#1c1c1c] transition-all cursor-pointer relative group"
            title="Sen2SR-RRDB Neural Engine Specs"
          >
            <Cpu size={18} />
            <span className="pointer-events-none absolute left-14 px-2.5 py-1 rounded-lg bg-[#141414] text-white border border-[#2a2a2a] text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
              Neural Engine Architecture
            </span>
          </button>

          {/* 3. Spectral Fidelity Info */}
          <button
            type="button"
            onClick={() => setSpecModalOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#1c1c1c] transition-all cursor-pointer relative group"
            title="Copernicus Spectral Bands & Fidelity"
          >
            <Activity size={18} />
            <span className="pointer-events-none absolute left-14 px-2.5 py-1 rounded-lg bg-[#141414] text-white border border-[#2a2a2a] text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
              10-Band Spectral Fidelity
            </span>
          </button>

          {/* 4. Mission Archive Drawer */}
          <button
            type="button"
            onClick={onOpenArchive}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#1c1c1c] transition-all cursor-pointer relative group"
            title={`Mission Archive (${totalScans} scans)`}
          >
            <Database size={18} />
            {totalScans > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white" />
            )}
            <span className="pointer-events-none absolute left-14 px-2.5 py-1 rounded-lg bg-[#141414] text-white border border-[#2a2a2a] text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
              Mission Archive ({totalScans})
            </span>
          </button>

          {/* 5. Satellite Feed Status */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#666666] hover:text-[#aaaaaa] hover:bg-[#141414] transition-all cursor-default relative group"
            title="Copernicus Sentinel-2 Constellation"
          >
            <Satellite size={17} />
            <span className="pointer-events-none absolute left-14 px-2.5 py-1 rounded-lg bg-[#141414] text-white border border-[#2a2a2a] text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
              Sentinel-2 MSI Feed: Active
            </span>
          </div>
        </div>

        {/* Bottom: Settings & Telemetry */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-px bg-[#1e1e1e]" />

          <button
            type="button"
            onClick={() => setModelModalOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#666666] hover:text-white hover:bg-[#161616] transition-all cursor-pointer relative group"
            title="System Parameters & Specs"
          >
            <Settings size={16} />
            <span className="pointer-events-none absolute left-14 px-2.5 py-1 rounded-lg bg-[#141414] text-white border border-[#2a2a2a] text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
              System Settings &amp; Telemetry
            </span>
          </button>
        </div>
      </aside>

      {/* ── Modal: Sen2SR-RRDB Architecture ── */}
      <AnimatePresence>
        {modelModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModelModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-xl rounded-3xl p-6 font-mono z-10 overflow-hidden shadow-2xl"
              style={{
                background: "#0c0c0c",
                border: "1px solid #262626",
                color: "#ffffff",
              }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#202020]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-bold">
                    <Cpu size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Sen2SR-RRDB Neural Engine
                    </h3>
                    <p className="text-[11px] text-[#888]">
                      Multi-Spectral Residual-in-Residual Dense Network
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModelModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-[#181818] border border-[#2a2a2a] flex items-center justify-center text-[#888] hover:text-white cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-5 space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-2xl bg-[#141414] border border-[#222]">
                    <span className="text-[9.5px] uppercase font-bold text-[#777] block">
                      Reconstruction PSNR
                    </span>
                    <span className="text-lg font-bold text-white mt-0.5 block tabular-nums">
                      35.9 dB
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#141414] border border-[#222]">
                    <span className="text-[9.5px] uppercase font-bold text-[#777] block">
                      Structural SSIM
                    </span>
                    <span className="text-lg font-bold text-white mt-0.5 block tabular-nums">
                      0.942
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#141414] border border-[#222]">
                    <span className="text-[9.5px] uppercase font-bold text-[#777] block">
                      Flux Preservation
                    </span>
                    <span className="text-lg font-bold text-white mt-0.5 block tabular-nums">
                      99.98%
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#121212] border border-[#202020] space-y-2">
                  <span className="text-[10px] uppercase font-bold text-[#888] tracking-wider block">
                    Architecture Highlights
                  </span>
                  <ul className="space-y-1.5 text-[11px] text-[#ccc]">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={13} className="text-white shrink-0 mt-0.5" />
                      <span>
                        <strong>Multi-Spectral Residual Dense Blocks:</strong> Channels B02–B12 reconstructed simultaneously with cross-spectral inter-band guidance.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={13} className="text-white shrink-0 mt-0.5" />
                      <span>
                        <strong>Zero-Hallucination Radiometric Lock:</strong> Downsampled SR outputs mathematically match Copernicus Sentinel-2 Level-2A surface reflectance.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={13} className="text-white shrink-0 mt-0.5" />
                      <span>
                        <strong>Sub-Pixel Convolution Upsampling:</strong> Eliminates checkerboard deconvolution artifacts for razor-sharp road, building, and coast edges.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setModelModalOpen(false)}
                    className="btn-white px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs cursor-pointer hover:bg-neutral-200 transition-colors"
                  >
                    Close Specs
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: 10-Band Spectral Fidelity ── */}
      <AnimatePresence>
        {specModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSpecModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-xl rounded-3xl p-6 font-mono z-10 overflow-hidden shadow-2xl"
              style={{
                background: "#0c0c0c",
                border: "1px solid #262626",
                color: "#ffffff",
              }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#202020]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-bold">
                    <Activity size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Sentinel-2 MSI 10-Band Pipeline
                    </h3>
                    <p className="text-[11px] text-[#888]">
                      Copernicus Surface Reflectance Super-Resolution (L2A)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSpecModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-[#181818] border border-[#2a2a2a] flex items-center justify-center text-[#888] hover:text-white cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-5 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-2xl bg-[#141414] border border-[#222]">
                    <span className="text-[9.5px] uppercase font-bold text-[#777] block">
                      Native Resolution (Input)
                    </span>
                    <span className="text-base font-bold text-white mt-0.5 block tabular-nums">
                      10.0m / 20.0m GSD
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#141414] border border-[#222]">
                    <span className="text-[9.5px] uppercase font-bold text-[#777] block">
                      Target Resolution (Output)
                    </span>
                    <span className="text-base font-bold text-white mt-0.5 block tabular-nums">
                      1.25m / 0.625m GSD
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#121212] border border-[#202020]">
                  <span className="text-[10px] uppercase font-bold text-[#888] tracking-wider block mb-2">
                    Super-Resolved Spectral Bands
                  </span>
                  <div className="grid grid-cols-5 gap-1.5 text-center font-mono">
                    {["B02 (Blue)", "B03 (Green)", "B04 (Red)", "B08 (NIR)", "B05 (RE1)", "B06 (RE2)", "B07 (RE3)", "B8A (Narrow NIR)", "B11 (SWIR1)", "B12 (SWIR2)"].map((b) => (
                      <div key={b} className="p-2 rounded-xl bg-[#181818] border border-[#252525]">
                        <span className="text-[10px] font-bold text-white block">{b.split(" ")[0]}</span>
                        <span className="text-[8.5px] text-[#777] truncate block">{b.split(" ")[1] ?? ""}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setSpecModalOpen(false)}
                    className="btn-white px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs cursor-pointer hover:bg-neutral-200 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
