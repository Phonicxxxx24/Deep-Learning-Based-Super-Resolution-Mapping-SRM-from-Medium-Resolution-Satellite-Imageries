"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Grid,
  Sparkles,
  Maximize2,
} from "lucide-react";
import { staticUrl } from "@/utils/api";

export interface MaximizeImageData {
  title: string;
  src: string;
  badge?: string;
  subtext?: string;
  resolution?: string;
  dimensions?: string;
  colorScale?: {
    gradient: string;
    minLabel: string;
    maxLabel: string;
  };
}

interface ImageMaximizeModalProps {
  image: MaximizeImageData | null;
  onClose: () => void;
}

export default function ImageMaximizeModal({
  image,
  onClose,
}: ImageMaximizeModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [crispPixels, setCrispPixels] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when opening a new image
  useEffect(() => {
    if (image) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setCrispPixels(false);
    }
  }, [image]);

  // Keyboard navigation: Escape to close, + / - to zoom, 0 to reset
  useEffect(() => {
    if (!image) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(6, +(z + 0.5).toFixed(1)));
      } else if (e.key === "-" || e.key === "_") {
        setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)));
      } else if (e.key === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image, onClose]);

  // Handle Mouse Wheel Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((prev) => {
      const next = Math.max(1, Math.min(6, +(prev + delta).toFixed(2)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Drag-to-pan handlers when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  };

  const fullImageUrl = image ? staticUrl(image.src) : "";

  return (
    <AnimatePresence>
      {image && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-6 select-none"
        >
          {/* ── Top Header Toolbar ── */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl rounded-2xl bg-[#111827]/90 border border-white/15 px-4 py-3 text-white shadow-2xl flex flex-wrap items-center justify-between gap-3 z-10"
          >
            {/* Title & Metadata */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#0066cc]/25 text-sky-400 border border-[#0066cc]/40">
                <Maximize2 size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    {image.title}
                  </h2>
                  {image.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#0066cc]/30 text-sky-300 border border-[#0066cc]/50">
                      {image.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  {image.resolution || "Full Lossless Resolution"}
                  {image.dimensions ? ` · ${image.dimensions}` : ""}
                  {image.subtext ? ` — ${image.subtext}` : ""}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Pixel-Level Crisp Rendering Mode */}
              <button
                onClick={() => setCrispPixels((p) => !p)}
                title={crispPixels ? "Switch to Smooth (Bilinear)" : "Switch to Crisp Pixels (Nearest Neighbor for Sub-pixel Inspection)"}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  crispPixels
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs"
                    : "bg-white/10 hover:bg-white/15 text-slate-300 border-white/10"
                }`}
              >
                <Grid size={13} />
                <span>{crispPixels ? "Crisp Pixels (1:1)" : "Smooth"}</span>
              </button>

              {/* Zoom Controls */}
              <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/10">
                <button
                  onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
                  disabled={zoom <= 1}
                  title="Zoom Out (-)"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="px-2 font-mono text-xs font-bold text-sky-400 min-w-[48px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(6, +(z + 0.5).toFixed(1)))}
                  disabled={zoom >= 6}
                  title="Zoom In (+)"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Reset Zoom (0)"
                  className="p-1.5 ml-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <RotateCcw size={13} />
                </button>
              </div>

              {/* Lossless Direct Download */}
              <a
                href={fullImageUrl}
                download={`${image.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.png`}
                title="Download original full-resolution PNG"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0066cc] hover:bg-[#0052a3] text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Download size={13} />
                <span>Download</span>
              </a>

              {/* Close Button */}
              <button
                onClick={onClose}
                title="Close (Esc)"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>

          {/* ── Main Viewport (Zero Resolution Loss) ── */}
          <div
            ref={containerRef}
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            className={`relative w-full max-w-5xl flex-1 flex items-center justify-center overflow-hidden my-3 rounded-2xl bg-[#090d16] border border-white/10 shadow-2xl ${
              zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
            }`}
          >
            {/* The Raw Unsampled Full-Res Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullImageUrl}
              alt={image.title}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 0.15s ease-out",
                imageRendering: crispPixels ? "pixelated" : "auto",
                maxHeight: "78vh",
                maxWidth: "100%",
                objectFit: "contain",
              }}
              className="select-none pointer-events-none drop-shadow-2xl"
            />

            {/* Optional Colorbar Scale for Spectral Indices */}
            {image.colorScale && (
              <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 text-white flex items-center gap-3 text-xs shadow-lg">
                <span className="font-mono text-[11px] text-slate-300">{image.colorScale.minLabel}</span>
                <div
                  className="w-32 h-2.5 rounded-full border border-white/20 shadow-inner"
                  style={{ background: image.colorScale.gradient }}
                />
                <span className="font-mono text-[11px] text-slate-300">{image.colorScale.maxLabel}</span>
              </div>
            )}
          </div>

          {/* ── Bottom Information Ribbon ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-400 text-xs flex items-center justify-between gap-4 font-mono"
          >
            <div className="flex items-center gap-2 text-[11px]">
              <Sparkles size={13} className="text-[#0066cc]" />
              <span>Full-Fidelity Lossless Viewport: Zero Compression & Zero Downsampling</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span>[Scroll / + / -] Zoom</span>
              <span>[Drag] Pan</span>
              <span>[Double-Click] Reset</span>
              <span>[Esc] Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
