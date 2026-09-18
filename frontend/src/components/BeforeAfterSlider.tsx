"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  SlidersHorizontal,
  Play,
  Pause,
  ArrowLeftRight,
  Maximize2,
  Sparkles,
  Layers,
  CheckCircle2,
  Eye,
  RotateCcw,
} from "lucide-react";
import { staticUrl } from "@/utils/api";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeBadge?: string;
  afterBadge?: string;
  beforeResolution?: string;
  afterResolution?: string;
  footprint?: string;
  onMaximizeBefore?: () => void;
  onMaximizeAfter?: () => void;
}

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Sentinel-2 L2A Input",
  afterLabel = "Dual-Path Super-Resolved SRM",
  beforeBadge = "10m Baseline GSD",
  afterBadge = "2.5m SRM · 4× Cleared",
  beforeResolution = "10m / px (BOA Reflectance)",
  afterResolution = "2.5m / px (LDSR-S2 Cleared)",
  footprint = "1.28 km × 1.28 km Ground Footprint",
  onMaximizeBefore,
  onMaximizeAfter,
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAutoSweeping, setIsAutoSweeping] = useState<boolean>(false);
  const [isSwapped, setIsSwapped] = useState<boolean>(false);
  const [showBadges, setShowBadges] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Compute active left and right content based on swap state
  const leftImage = isSwapped ? afterSrc : beforeSrc;
  const leftLabel = isSwapped ? afterLabel : beforeLabel;
  const leftBadge = isSwapped ? afterBadge : beforeBadge;
  const leftRes = isSwapped ? afterResolution : beforeResolution;
  const onMaximizeLeft = isSwapped ? onMaximizeAfter : onMaximizeBefore;

  const rightImage = isSwapped ? beforeSrc : afterSrc;
  const rightLabel = isSwapped ? beforeLabel : afterLabel;
  const rightBadge = isSwapped ? beforeBadge : afterBadge;
  const rightRes = isSwapped ? beforeResolution : afterResolution;
  const onMaximizeRight = isSwapped ? onMaximizeBefore : onMaximizeAfter;

  // Calculate pointer percentage relative to container width
  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  // Handle pointer down on container or handle
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setIsAutoSweeping(false);
    updatePosition(e.clientX);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      setIsAutoSweeping(false);
      setSliderPosition((p) => Math.max(0, p - (e.shiftKey ? 10 : 2)));
    } else if (e.key === "ArrowRight") {
      setIsAutoSweeping(false);
      setSliderPosition((p) => Math.min(100, p + (e.shiftKey ? 10 : 2)));
    } else if (e.key === "Home") {
      setSliderPosition(0);
    } else if (e.key === "End") {
      setSliderPosition(100);
    }
  };

  // Auto-Sweep ping-pong animation
  useEffect(() => {
    if (!isAutoSweeping) return;
    let animationFrameId: number;
    let direction = 1; // 1 = moving right, -1 = moving left
    const speed = 0.28; // % per frame (~60fps)

    const step = () => {
      setSliderPosition((prev) => {
        let next = prev + direction * speed;
        if (next >= 85) {
          next = 85;
          direction = -1;
        } else if (next <= 15) {
          next = 15;
          direction = 1;
        }
        return next;
      });
      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isAutoSweeping]);

  return (
    <section className="space-y-3">
      {/* ── Section Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#0066cc]/10 text-[#0066cc] flex items-center justify-center border border-[#0066cc]/20 shadow-xs">
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1a1f2e] uppercase tracking-wider">
                Interactive Before / After Resolution Slider
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0066cc]/10 text-[#0066cc] border border-[#0066cc]/20">
                Live Sub-Pixel Comparison
              </span>
            </div>
            <p className="text-xs text-[#6b7a99] mt-0.5">
              Slide horizontally to reveal the raw 10m Sentinel-2 input vs the cleared 2.5m super-resolved image simultaneously.
            </p>
          </div>
        </div>

        {/* Quick Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Preset Buttons */}
          <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 p-0.5 shadow-2xs">
            <button
              onClick={() => {
                setIsAutoSweeping(false);
                setSliderPosition(25);
              }}
              className={`px-2.5 py-1 rounded-lg font-mono tabular-nums text-[11px] font-semibold transition-all cursor-pointer ${
                Math.round(sliderPosition) === 25 && !isAutoSweeping
                  ? "bg-[#0066cc] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
              title="Show 25% Input / 75% Cleared"
            >
              25%
            </button>
            <button
              onClick={() => {
                setIsAutoSweeping(false);
                setSliderPosition(50);
              }}
              className={`px-2.5 py-1 rounded-lg font-mono tabular-nums text-[11px] font-semibold transition-all cursor-pointer ${
                Math.round(sliderPosition) === 50 && !isAutoSweeping
                  ? "bg-[#0066cc] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
              title="Classic 50/50 Split View"
            >
              50% Split
            </button>
            <button
              onClick={() => {
                setIsAutoSweeping(false);
                setSliderPosition(75);
              }}
              className={`px-2.5 py-1 rounded-lg font-mono tabular-nums text-[11px] font-semibold transition-all cursor-pointer ${
                Math.round(sliderPosition) === 75 && !isAutoSweeping
                  ? "bg-[#0066cc] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
              title="Show 75% Input / 25% Cleared"
            >
              75%
            </button>
          </div>

          {/* Auto-Sweep Animation Button */}
          <button
            onClick={() => setIsAutoSweeping((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
              isAutoSweeping
                ? "bg-[#0066cc] border-[#0066cc] text-white shadow-xs"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
            }`}
            title={isAutoSweeping ? "Pause automatic scan" : "Play continuous radar sweep animation"}
          >
            {isAutoSweeping ? <Pause size={12} /> : <Play size={12} />}
            <span>{isAutoSweeping ? "Sweeping..." : "Auto-Sweep"}</span>
          </button>

          {/* Swap Sides */}
          <button
            onClick={() => setIsSwapped((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs text-xs font-semibold transition-all cursor-pointer active:scale-98"
            title="Swap which image is on left vs right"
          >
            <ArrowLeftRight size={12} className="text-slate-500" />
            <span>Swap</span>
          </button>
        </div>
      </div>

      {/* ── Main Slider Canvas Container ── */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-full aspect-square max-w-3xl mx-auto rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 shadow-md select-none cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-[#0066cc]/40"
        style={{ touchAction: "none" }}
      >
        {/* ── Bottom Layer (Right reveal) ── */}
        <div className="absolute inset-0 w-full h-full">
          <Image
            src={staticUrl(rightImage)}
            alt={rightLabel}
            fill
            sizes="(max-width: 1024px) 100vw, 768px"
            className="object-cover pointer-events-none"
            priority
            unoptimized
          />
        </div>

        {/* ── Top Layer (Left reveal, clipped by sliderPosition) ── */}
        <div
          className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden"
          style={{
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
            WebkitClipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
          }}
        >
          <Image
            src={staticUrl(leftImage)}
            alt={leftLabel}
            fill
            sizes="(max-width: 1024px) 100vw, 768px"
            className="object-cover pointer-events-none"
            priority
            unoptimized
          />
        </div>

        {/* ── Center Divider Bar & Interactive Knob ── */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-20 flex items-center justify-center"
          style={{ left: `${sliderPosition}%` }}
        >
          {/* Vertical Laser Divider Line */}
          <div className="absolute inset-y-0 -left-[1px] w-[2px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.85),0_0_4px_rgba(255,255,255,0.9)]" />

          {/* Draggable Center Disc Handle */}
          <div
            className={`w-11 h-11 rounded-full bg-white text-[#1a1f2e] shadow-2xl border-2 border-[#0066cc] flex items-center justify-center pointer-events-auto cursor-ew-resize transition-transform duration-150 ${
              isDragging ? "scale-110 ring-4 ring-[#0066cc]/30" : "hover:scale-105"
            }`}
            title="Drag horizontally to compare images"
          >
            <div className="flex items-center gap-0.5 text-[#0066cc]">
              <span className="text-[9px] font-black">◀</span>
              <div className="w-[1.5px] h-3.5 bg-[#0066cc]/40 mx-0.5" />
              <span className="text-[9px] font-black">▶</span>
            </div>

            {/* Floating Live Percentage Tag */}
            <div className="absolute -top-7 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-white font-mono text-[10px] font-bold shadow-md border border-white/15 whitespace-nowrap pointer-events-none">
              {Math.round(sliderPosition)}%
            </div>
          </div>
        </div>

        {/* ── Left Floating Badge (Before / Input) ── */}
        {showBadges && (
          <div
            className="absolute top-3.5 left-3.5 z-10 flex flex-col gap-1 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: sliderPosition < 12 ? 0.15 : 1,
            }}
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white border border-white/20 shadow-lg text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>{leftLabel}</span>
              <span className="text-[10px] opacity-75 font-mono">({leftBadge})</span>
            </div>
            <div className="px-2.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-mono text-white/80 self-start border border-white/10">
              {leftRes}
            </div>
          </div>
        )}

        {/* ── Right Floating Badge (After / Cleared) ── */}
        {showBadges && (
          <div
            className="absolute top-3.5 right-3.5 z-10 flex flex-col items-end gap-1 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: sliderPosition > 88 ? 0.15 : 1,
            }}
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white border border-white/20 shadow-lg text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{rightLabel}</span>
              <span className="text-[10px] opacity-75 font-mono">({rightBadge})</span>
            </div>
            <div className="px-2.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-mono text-white/80 self-end border border-white/10">
              {rightRes}
            </div>
          </div>
        )}

        {/* ── Bottom Corner Instructions & Footprint ── */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-black/65 backdrop-blur-md text-white/90 text-[10px] font-medium border border-white/15 shadow-md flex items-center gap-1.5">
            <span className="opacity-70">Ground Footprint:</span>
            <strong className="font-mono text-white">{footprint}</strong>
          </div>
        </div>

        {/* ── Bottom Right Lossless Maximize Shortcuts ── */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 pointer-events-auto">
          {onMaximizeRight && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMaximizeRight();
              }}
              title="Open full lossless resolution inspector"
              className="px-2.5 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 shadow-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer group"
            >
              <Maximize2 size={12} className="group-hover:scale-110 transition-transform" />
              <span>Inspect Maximize</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Bottom Info Strip & Interaction Guide ── */}
      <div className="flex items-center justify-between text-xs text-[#6b7a99] px-2 py-1 bg-white/60 rounded-xl border border-[#dde3ed]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0066cc]" />
          <span>
            <strong>Interactive Guidance:</strong> Drag the slider handle or click anywhere across the image to evaluate sharpness, building edges, and field boundaries.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBadges((b) => !b)}
            className="hover:text-[#0066cc] transition-colors cursor-pointer text-[11px]"
          >
            {showBadges ? "Hide Labels" : "Show Labels"}
          </button>
          <button
            onClick={() => {
              setIsAutoSweeping(false);
              setSliderPosition(50);
            }}
            className="flex items-center gap-1 hover:text-[#0066cc] transition-colors cursor-pointer text-[11px]"
            title="Reset slider to 50%"
          >
            <RotateCcw size={11} /> Reset (50%)
          </button>
        </div>
      </div>
    </section>
  );
}
