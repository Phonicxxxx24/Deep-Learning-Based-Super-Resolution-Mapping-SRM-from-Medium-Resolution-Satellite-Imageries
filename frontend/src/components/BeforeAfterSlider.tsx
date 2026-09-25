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
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3 font-mono"
    >
      {/* ── Section Header ── */}
      <div className="ios-glass-card rounded-[28px] p-4 sm:p-5 border border-white/15 backdrop-blur-xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 text-white flex items-center justify-center border border-white/15 backdrop-blur-xl shadow-inner shrink-0">
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider drop-shadow-sm">
                Interactive Before / After Resolution Slider
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white border border-white/20 backdrop-blur-md">
                Live Sub-Pixel Comparison
              </span>
            </div>
            <p className="text-xs text-white/60 mt-0.5">
              Slide horizontally to reveal raw Sentinel-2 input vs super-resolved output.
            </p>
          </div>
        </div>

        {/* Quick Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap text-xs self-start lg:self-auto">
          {/* iOS Segmented Preset Buttons */}
          <div className="flex items-center p-1 rounded-2xl bg-white/[0.05] border border-white/12 backdrop-blur-xl gap-0.5">
            {[
              { val: 25, label: "25%" },
              { val: 50, label: "50% Split" },
              { val: 75, label: "75%" },
            ].map(({ val, label }) => {
              const isSel = Math.round(sliderPosition) === val && !isAutoSweeping;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setIsAutoSweeping(false);
                    setSliderPosition(val);
                  }}
                  className={`relative px-3 py-1.5 rounded-xl font-mono tabular-nums text-[11px] font-semibold transition-all cursor-pointer active:scale-95 ${
                    isSel
                      ? "text-black font-bold shadow-md"
                      : "text-white/70 hover:text-white hover:bg-white/[0.04]"
                  }`}
                  title={`Show ${val}% Left View`}
                >
                  {isSel && (
                    <motion.div
                      layoutId="activeSliderPreset"
                      className="absolute inset-0 bg-white rounded-xl shadow-sm"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Auto-Sweep Animation Button */}
          <button
            type="button"
            onClick={() => setIsAutoSweeping((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
              isAutoSweeping
                ? "bg-white text-black border-white shadow-lg shadow-white/20 font-bold"
                : "bg-white/[0.06] hover:bg-white/[0.12] border-white/15 text-white backdrop-blur-xl"
            }`}
            title={isAutoSweeping ? "Pause automatic scan" : "Play continuous radar sweep animation"}
          >
            {isAutoSweeping ? <Pause size={12} className="animate-pulse" /> : <Play size={12} />}
            <span>{isAutoSweeping ? "Sweeping…" : "Auto-Sweep"}</span>
          </button>

          {/* Swap Sides */}
          <button
            type="button"
            onClick={() => setIsSwapped((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/15 shadow-sm text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl active:scale-95"
            title="Swap which image is on left vs right"
          >
            <motion.div
              animate={{ rotate: isSwapped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <ArrowLeftRight size={12} className="text-white/80" />
            </motion.div>
            <span>Swap</span>
          </button>

          {/* Reset (50%) */}
          <button
            type="button"
            onClick={() => {
              setIsAutoSweeping(false);
              setSliderPosition(50);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/15 shadow-sm text-xs font-semibold transition-all cursor-pointer backdrop-blur-xl active:scale-95"
            title="Reset slider to 50%"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
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
        className="relative w-full aspect-square max-w-3xl mx-auto rounded-[32px] overflow-hidden bg-black/90 border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] select-none cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-white/40 group"
        style={{ touchAction: "none" }}
      >
        {/* Specular Ambient Glow at Top */}
        <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-30" />

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
          {/* Vertical Laser Divider Line with Specular Halo */}
          <div className="absolute inset-y-0 -left-[1px] w-[2px] bg-white shadow-[0_0_16px_rgba(255,255,255,0.9),0_0_4px_rgba(255,255,255,1)]" />

          {/* Draggable Center Disc Handle */}
          <div
            className={`w-11 h-11 rounded-full bg-white text-black shadow-[0_4px_24px_rgba(0,0,0,0.6),0_0_0_2px_rgba(255,255,255,0.9)] flex items-center justify-center pointer-events-auto cursor-ew-resize transition-all duration-200 ${
              isDragging ? "scale-115 ring-4 ring-white/50" : "hover:scale-108 active:scale-95"
            }`}
            title="Drag horizontally to compare images"
          >
            <div className="flex items-center gap-0.5 text-black">
              <span className="text-[9px] font-black">◀</span>
              <div className="w-[1.5px] h-3.5 bg-black/40 mx-0.5 rounded-full" />
              <span className="text-[9px] font-black">▶</span>
            </div>

            {/* Floating Live Percentage Tag */}
            <div className="absolute -top-8 px-2.5 py-0.5 rounded-full bg-black/85 backdrop-blur-xl text-white font-mono text-[10.5px] font-bold shadow-lg border border-white/20 whitespace-nowrap pointer-events-none tabular-nums">
              {Math.round(sliderPosition)}%
            </div>
          </div>
        </div>

        {/* ── Left Floating Badge (Before / Input) ── */}
        {showBadges && (
          <div
            className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: sliderPosition < 14 ? 0.15 : 1,
            }}
          >
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-xl text-white border border-white/20 shadow-xl text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
              <span>{leftLabel}</span>
              <span className="text-[10px] text-white/70 font-mono">({leftBadge})</span>
            </div>
            <div className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-mono text-white/80 self-start border border-white/10 shadow-sm">
              {leftRes}
            </div>
          </div>
        )}

        {/* ── Right Floating Badge (After / Cleared) ── */}
        {showBadges && (
          <div
            className="absolute top-4 right-4 z-10 flex flex-col items-end gap-1.5 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: sliderPosition > 86 ? 0.15 : 1,
            }}
          >
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-xl text-white border border-white/20 shadow-xl text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>{rightLabel}</span>
              <span className="text-[10px] text-white/70 font-mono">({rightBadge})</span>
            </div>
            <div className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-mono text-white/80 self-end border border-white/10 shadow-sm">
              {rightRes}
            </div>
          </div>
        )}

        {/* ── Bottom Corner Instructions & Footprint ── */}
        <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-xl text-white/90 text-[10.5px] font-medium border border-white/15 shadow-lg flex items-center gap-1.5">
            <span className="text-white/60">Footprint:</span>
            <strong className="font-mono text-white">{footprint}</strong>
          </div>
        </div>

        {/* ── Bottom Right Lossless Maximize Shortcuts ── */}
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 pointer-events-auto">
          {onMaximizeRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMaximizeRight();
              }}
              title="Open full lossless resolution inspector"
              className="px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-xl border border-white/20 shadow-xl transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer active:scale-95 group/btn"
            >
              <Maximize2 size={12} className="group-hover/btn:scale-110 transition-transform" />
              <span>Inspect Maximize</span>
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
