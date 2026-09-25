"use client";

import React from "react";

export default function LiquidBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10 bg-transparent">
      {/* Soft Monochrome Specular Light Diffusion (Top Left) */}
      <div
        className="absolute -top-40 -left-40 w-[680px] h-[680px] rounded-full blur-[140px] pointer-events-none animate-monochrome-orbit"
        style={{
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 50%, transparent 70%)",
        }}
      />

      {/* Secondary Monochrome Light Glow (Bottom Right) */}
      <div
        className="absolute -bottom-48 right-1/4 w-[640px] h-[640px] rounded-full blur-[150px] pointer-events-none animate-monochrome-orbit"
        style={{
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 50%, transparent 70%)",
          animationDelay: "-7s",
        }}
      />

      {/* Subtle Vignette Overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 45%, rgba(0, 0, 0, 0.3) 100%)",
        }}
      />
    </div>
  );
}
