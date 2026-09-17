"use client";

import React from "react";

export default function LiquidBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10 bg-[#f0f2f5]">
      {/* Orb 1: Soft Blue Fluid Glow */}
      <div
        className="absolute -top-24 -left-24 w-[600px] h-[600px] rounded-full pointer-events-none opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(0, 102, 204, 0.22) 0%, rgba(56, 189, 248, 0.12) 45%, transparent 70%)",
        }}
      />

      {/* Orb 2: Teal/Aqua Specular Glow */}
      <div
        className="absolute top-1/3 -right-24 w-[650px] h-[650px] rounded-full pointer-events-none opacity-35"
        style={{
          background: "radial-gradient(circle, rgba(0, 212, 170, 0.20) 0%, rgba(0, 102, 204, 0.10) 45%, transparent 70%)",
        }}
      />

      {/* Orb 3: Warm Ambient Radiance */}
      <div
        className="absolute -bottom-28 left-1/4 w-[700px] h-[700px] rounded-full pointer-events-none opacity-25"
        style={{
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 70%)",
        }}
      />

      {/* Subtle Micro-Grid Overlay for Enterprise Cartography Feel */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#1a1f2e 1px, transparent 1px), linear-gradient(to right, #1a1f2e 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}
