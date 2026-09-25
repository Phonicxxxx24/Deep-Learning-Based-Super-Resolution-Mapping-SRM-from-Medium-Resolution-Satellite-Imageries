"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cpu, CheckCircle2, ShieldCheck, Zap } from "lucide-react";

interface SpecsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpecsModal({ isOpen, onClose }: SpecsModalProps) {
  const [activeTab, setActiveTab] = useState<"engine" | "bands">("engine");

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-lg rounded-[28px] p-6 font-sans z-10 overflow-hidden shadow-2xl ios-glass-card border border-white/20 select-none text-white"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white shadow-inner">
                  <Cpu size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white tracking-tight">
                    System Architecture &amp; Engine
                  </h3>
                  <p className="text-xs text-white/50">
                    Sen2SR-RRDB Neural Super-Resolution
                  </p>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
              >
                <X size={15} />
              </motion.button>
            </div>

            {/* iOS Segmented Tab Bar */}
            <div className="ios-segmented my-4 relative p-1">
              {[
                { id: "engine", label: "Neural Engine" },
                { id: "bands", label: "10-Band Spectral Fidelity" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as "engine" | "bands")}
                  className="relative flex-1 py-2 px-3 rounded-xl text-center cursor-pointer transition-colors text-xs font-semibold"
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="specsModalTab"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-white text-black rounded-xl shadow-md"
                    />
                  )}
                  <span
                    className={`relative z-10 block ${
                      activeTab === tab.id ? "text-black font-bold" : "text-white/60 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Tab 1: Neural Engine Specs */}
            {activeTab === "engine" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-2xl ios-glass-subtle text-center">
                    <span className="text-[10px] uppercase font-semibold text-white/50 block">
                      PSNR Gain
                    </span>
                    <span className="text-xl font-bold text-white mt-0.5 block tabular-nums">
                      35.9 dB
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl ios-glass-subtle text-center">
                    <span className="text-[10px] uppercase font-semibold text-white/50 block">
                      SSIM Score
                    </span>
                    <span className="text-xl font-bold text-white mt-0.5 block tabular-nums">
                      0.942
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl ios-glass-subtle text-center">
                    <span className="text-[10px] uppercase font-semibold text-white/50 block">
                      Flux Purity
                    </span>
                    <span className="text-xl font-bold text-white mt-0.5 block tabular-nums">
                      99.98%
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl ios-glass-subtle space-y-2.5 text-xs text-white/80">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={15} className="text-white shrink-0 mt-0.5" />
                    <span>
                      <strong>Residual Dense Architecture:</strong> High-capacity residual connections map 10m Sentinel-2 pixels to 2.5m (4×) and 0.625m (8× sub-metre) resolution.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck size={15} className="text-white shrink-0 mt-0.5" />
                    <span>
                      <strong>Radiometric Invariance:</strong> Guaranteed spectral flux conservation prevents artificial hallucinations in biophysical indices.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Zap size={15} className="text-white shrink-0 mt-0.5" />
                    <span>
                      <strong>PyTorch TensorRT Acceleration:</strong> Sub-second tiled inference with real-time uncertainty propagation.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Tab 2: Spectral Bands (Monochrome silver scale) */
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {[
                  { band: "B02", name: "Blue (490 nm)", res: "10m → 2.5m / 0.625m", shade: "#ffffff" },
                  { band: "B03", name: "Green (560 nm)", res: "10m → 2.5m / 0.625m", shade: "#e6e6e6" },
                  { band: "B04", name: "Red (665 nm)", res: "10m → 2.5m / 0.625m", shade: "#cccccc" },
                  { band: "B08", name: "NIR Broad (842 nm)", res: "10m → 2.5m / 0.625m", shade: "#b3b3b3" },
                  { band: "B05-B07", name: "Red Edge Series", res: "20m → 2.5m / 0.625m", shade: "#999999" },
                  { band: "B11-B12", name: "SWIR1 & SWIR2", res: "20m → 2.5m / 0.625m", shade: "#808080" },
                ].map((item) => (
                  <div
                    key={item.band}
                    className="p-3 rounded-2xl ios-glass-subtle flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: item.shade }}
                      />
                      <div>
                        <span className="font-semibold text-white">{item.band}</span>
                        <span className="text-white/60 ml-2">{item.name}</span>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-white/50">{item.res}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Dismiss */}
            <div className="mt-5 pt-3 border-t border-white/10 flex justify-end">
              <motion.button
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-full text-xs font-bold bg-white text-black hover:bg-neutral-200 transition-all cursor-pointer shadow-md"
              >
                Close
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
