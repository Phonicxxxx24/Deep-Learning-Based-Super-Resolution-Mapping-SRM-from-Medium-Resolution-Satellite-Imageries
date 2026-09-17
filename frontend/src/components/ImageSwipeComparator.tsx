"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Sparkles,
  Layers,
  Activity,
  Eye,
  Check,
} from "lucide-react";
import { staticUrl } from "@/utils/api";

interface ImageSwipeComparatorProps {
  lrUrl: string;
  srUrl: string;
  ndviUrl?: string | null;
  mndwiUrl?: string | null;
  ndbiUrl?: string | null;
  uncertaintyUrl?: string | null;
  initialScale?: number; // 4 or 8
  aoiLabel?: string;
}

type LayerMode = "rgb" | "ndvi" | "mndwi" | "ndbi" | "uncertainty";

export default function ImageSwipeComparator({
  lrUrl,
  srUrl,
  ndviUrl,
  mndwiUrl,
  ndbiUrl,
  uncertaintyUrl,
  initialScale = 4,
  aoiLabel = "Target AOI",
}: ImageSwipeComparatorProps) {
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [scaleFactor, setScaleFactor] = useState<number>(initialScale);
  const [layerMode, setLayerMode] = useState<LayerMode>("rgb");

  // Pan & Zoom State
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSplitting, setIsSplitting] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Determine active SR image source based on layer
  const getSrImage = () => {
    switch (layerMode) {
      case "ndvi":
        return ndviUrl ?? srUrl;
      case "mndwi":
        return mndwiUrl ?? srUrl;
      case "ndbi":
        return ndbiUrl ?? srUrl;
      case "uncertainty":
        return uncertaintyUrl ?? srUrl;
      default:
        return srUrl;
    }
  };

  const getLayerName = () => {
    switch (layerMode) {
      case "ndvi":
        return "Vegetation Index (NDVI)";
      case "mndwi":
        return "Water & Moisture (MNDWI)";
      case "ndbi":
        return "Urban Built-up (NDBI)";
      case "uncertainty":
        return "Epistemic Uncertainty Heatmap";
      default:
        return "True Color Surface Reflectance (RGB)";
    }
  };

  const activeSrSrc = getSrImage();
  const gsdText = scaleFactor === 8 ? "0.625 m" : "2.5 m";
  const pixelDensityText = scaleFactor === 8 ? "256× (2048px)" : "16× (512px)";
  const dimensionsText = scaleFactor === 8 ? "2048×2048px" : "512×512px";

  // Handle Split Dragging
  const handleSplitStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSplitting(true);
  };

  // Handle Pan Dragging
  const handlePanStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".controls-bar")) return;
    setIsPanning(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  // Global mouse move & mouse up listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isSplitting && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSplitPercent(pct);
      } else if (isPanning) {
        setPan({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsSplitting(false);
      setIsPanning(false);
    };

    if (isSplitting || isPanning) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSplitting, isPanning]);

  // Handle Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 1.15 : 0.88;
    setZoom((prev) => Math.max(0.75, Math.min(6, prev * zoomDelta)));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSplitPercent(50);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ── Top Multi-Scale & Layer Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl glass-card bg-white/90 shadow-xs">
        {/* Layer Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-[#6b7a99] uppercase tracking-wider mr-1">
            Layer:
          </span>
          <button
            onClick={() => setLayerMode("rgb")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              layerMode === "rgb"
                ? "bg-[#0066cc] text-white shadow-xs"
                : "bg-[#f7f8fa] text-[#6b7a99] hover:bg-[#eef2f8]"
            }`}
          >
            True Color
          </button>
          {ndviUrl && (
            <button
              onClick={() => setLayerMode("ndvi")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                layerMode === "ndvi"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-[#f7f8fa] text-[#6b7a99] hover:bg-[#eef2f8]"
              }`}
            >
              NDVI
            </button>
          )}
          {mndwiUrl && (
            <button
              onClick={() => setLayerMode("mndwi")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                layerMode === "mndwi"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-[#f7f8fa] text-[#6b7a99] hover:bg-[#eef2f8]"
              }`}
            >
              MNDWI
            </button>
          )}
          {ndbiUrl && (
            <button
              onClick={() => setLayerMode("ndbi")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                layerMode === "ndbi"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-[#f7f8fa] text-[#6b7a99] hover:bg-[#eef2f8]"
              }`}
            >
              NDBI
            </button>
          )}
          {uncertaintyUrl && (
            <button
              onClick={() => setLayerMode("uncertainty")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                layerMode === "uncertainty"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-[#f7f8fa] text-[#6b7a99] hover:bg-[#eef2f8]"
              }`}
            >
              Uncertainty
            </button>
          )}
        </div>

        {/* 4x vs 8x Multi-Scale Resolution Switcher */}
        <div className="flex items-center gap-2 bg-[#f7f8fa] p-1 rounded-xl border border-[#dde3ed]">
          <span className="text-[10px] font-bold text-[#6b7a99] uppercase tracking-wider px-2">
            Enhancement:
          </span>
          <button
            onClick={() => setScaleFactor(4)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              scaleFactor === 4
                ? "bg-white text-[#0066cc] shadow-xs border border-[#dde3ed]"
                : "text-[#6b7a99] hover:text-[#1a1f2e]"
            }`}
          >
            4× (512px · 2.5 m)
          </button>
          <button
            onClick={() => setScaleFactor(8)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              scaleFactor === 8
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs"
                : "text-[#6b7a99] hover:text-[#1a1f2e]"
            }`}
            title="8× Super-Resolution: 2048×2048px sub-meter output from 128px original"
          >
            <Sparkles size={11} />
            8× Ultra-Res (2048px · 0.625 m)
          </button>
        </div>
      </div>

      {/* ── Visual Comparator Main Canvas ── */}
      <div
        ref={containerRef}
        onMouseDown={handlePanStart}
        onWheel={handleWheel}
        className={`relative w-full h-[580px] rounded-2xl overflow-hidden select-none shadow-xl border border-white/20 bg-radial from-[#0f172a] to-[#020617] ${
          isPanning ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Transform Stage (Synchronous Pan & Zoom) */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.05s ease-out",
          }}
          className="absolute inset-0 w-full h-full will-change-transform flex items-center justify-center pointer-events-none"
        >
          {/* Base Layer: 10m Sentinel-2 Input (Pixelated for native inspection) */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Image
              src={staticUrl(lrUrl)}
              alt="Sentinel-2 10m Input"
              fill
              unoptimized
              className="object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* Super-Resolved Overlay (Clipped by split percentage) */}
          <div
            style={{
              clipPath: `polygon(${splitPercent}% 0, 100% 0, 100% 100%, ${splitPercent}% 100%)`,
            }}
            className="absolute inset-0 flex items-center justify-center p-4 will-change-[clip-path]"
          >
            <Image
              src={staticUrl(activeSrSrc)}
              alt="Super-Resolved Output"
              fill
              unoptimized
              className={`object-contain ${
                scaleFactor === 8 ? "contrast-105 brightness-102" : ""
              }`}
            />
          </div>
        </div>

        {/* ── Draggable Split Divider ── */}
        <div
          style={{ left: `${splitPercent}%` }}
          onMouseDown={handleSplitStart}
          onTouchStart={handleSplitStart}
          className="absolute top-0 bottom-0 w-1 -ml-0.5 bg-gradient-to-b from-[#38bdf8] via-[#818cf8] to-[#c084fc] shadow-[0_0_12px_rgba(56,189,248,0.9)] cursor-ew-resize z-40 touch-none flex items-center justify-center"
        >
          <div className="w-9 h-9 rounded-full bg-[#0f172a]/95 border-2 border-[#38bdf8] shadow-[0_0_16px_rgba(56,189,248,0.8)] text-[#38bdf8] flex items-center justify-center cursor-ew-resize">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M8 7l-5 5 5 5V7zm8 0v10l5-5-5-5z" />
            </svg>
          </div>
        </div>

        {/* ── Floating Badges ── */}
        <div className="absolute top-4 left-4 z-30 pointer-events-none px-3 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-black/60 backdrop-blur-md text-slate-300 border border-white/15 shadow-md">
          📡 Sentinel-2 L2A (128×128px · 10 m)
        </div>

        <div className="absolute top-4 right-4 z-30 pointer-events-none px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-[#0284c7]/80 backdrop-blur-md text-white border border-[#38bdf8]/40 shadow-md flex items-center gap-1.5">
          <Sparkles size={12} className="text-amber-300" />
          <span>
            SRM Dual-Path ({scaleFactor}× · {dimensionsText} · {gsdText})
          </span>
        </div>



        {/* ── Floating Pan/Zoom Control HUD (Bottom Right) ── */}
        <div className="controls-bar absolute bottom-4 right-4 z-30 flex items-center gap-1 bg-black/75 backdrop-blur-md p-1.5 rounded-full border border-white/20 shadow-lg">
          <button
            onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
            className="p-2 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.75, z / 1.25))}
            className="p-2 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Reset View"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[#6b7a99] px-1">
        <span>
          Showing: <strong className="text-[#1a1f2e]">{getLayerName()}</strong>
        </span>
        <span className="font-mono">
          Drag split slider · Drag image to pan · Scroll wheel to zoom
        </span>
      </div>
    </div>
  );
}
