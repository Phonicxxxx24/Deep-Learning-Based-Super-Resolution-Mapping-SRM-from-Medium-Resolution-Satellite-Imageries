"use client";

import React from "react";

export default function LiquidBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10 bg-[#f8fafc]">
      {/* Primary Ambient Atmosphere Glow */}
      <div
        className="absolute -top-32 -left-32 w-[640px] h-[640px] rounded-full pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(2, 132, 199, 0.25) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 70%)",
        }}
      />

      {/* Secondary Edge Glow */}
      <div
        className="absolute top-1/2 -right-32 w-[600px] h-[600px] rounded-full pointer-events-none opacity-15"
        style={{
          background: "radial-gradient(circle, rgba(14, 165, 233, 0.20) 0%, rgba(99, 102, 241, 0.06) 50%, transparent 70%)",
        }}
      />

      {/* Engineering Precision Cartographic Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(to right, #0f172a 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  );
}
