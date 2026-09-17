"use client";

import React from "react";

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
  depth?: number;
  glare?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Card3D({
  children,
  className = "",
  onClick,
  style,
}: Card3DProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`relative rounded-2xl transition-all duration-200 ${className}`}
    >
      {children}
    </div>
  );
}
