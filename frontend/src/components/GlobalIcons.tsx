import React from "react";

export function Satellite3DIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 2L3 12" />
      <path d="M11 14L21 4" />
      <path d="M14.5 9.5l3 3" />
      <path d="M6.5 17.5l3 3" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" fill="currentColor" fillOpacity="0.15" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M18 18a6 6 0 0 0-8.5-8.5" strokeDasharray="2 2" />
    </svg>
  );
}

export function SpectralPrismIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="12 2 2 22 22 22" fill="currentColor" fillOpacity="0.08" />
      <line x1="2" y1="14" x2="12" y2="10" />
      <line x1="12" y1="10" x2="22" y2="8" stroke="#38bdf8" />
      <line x1="12" y1="10" x2="22" y2="12" stroke="#22c55e" />
      <line x1="12" y1="10" x2="22" y2="16" stroke="#e8850a" />
      <line x1="12" y1="10" x2="22" y2="20" stroke="#d93025" />
    </svg>
  );
}

export function RadarReticleIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" strokeDasharray="3 3" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export function EarthGlobeIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function DatabaseArchiveIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <line x1="12" y1="12" x2="12" y2="15" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function LiquidWaveIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 12c2.5-3 5.5-3 8 0s5.5 3 8 0 4-2 4-2" />
      <path d="M2 17c2.5-3 5.5-3 8 0s5.5 3 8 0 4-2 4-2" opacity="0.6" />
      <path d="M2 7c2.5-3 5.5-3 8 0s5.5 3 8 0 4-2 4-2" opacity="0.3" />
    </svg>
  );
}

export function UrbanGridIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function DisasterPulseIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="12 2 22 20 2 20 12 2" fill="currentColor" fillOpacity="0.1" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" />
    </svg>
  );
}

export function AgricultureLeafIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 20A7 7 0 0 1 4 13C4 6.5 12 3 20 3c0 8-3.5 17-9 17Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M4 13c3 0 7.5 1.5 10 5" />
      <path d="M12 8c1.5 1 3 2.5 4 4" />
    </svg>
  );
}
