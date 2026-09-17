export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export const PATCH_SIZE_PX = 128;   // LR patch size
export const SR_SCALE      = 4;     // → 512px output
export const LR_RES_M      = 10;    // metres per pixel
export const SR_RES_M      = 2.5;   // metres per pixel after SR

/** Ground footprint of the 128px LR patch in metres */
export const PATCH_FOOTPRINT_M = PATCH_SIZE_PX * LR_RES_M; // 1280 m

export const BAND_NAMES = [
  "B02", "B03", "B04", "B05", "B06",
  "B07", "B08", "B8A", "B11", "B12",
] as const;

export const POLL_INTERVAL_MS = 3000; // status polling cadence

export const DEFAULT_MAP_CENTER: [number, number] = [20.5937, 78.9629]; // India
export const DEFAULT_MAP_ZOOM = 5;

/**
 * Quality tiers for the sampling_steps dropdown.
 * These map directly to the API's `sampling_steps` field.
 * Enabled for testing — will be hardcoded / removed before final submission.
 */
export const QUALITY_TIERS = [
  { steps: 50,  label: "Fast (50 steps)",         approxTime: "~45 s" },
  { steps: 100, label: "Full quality (100 steps)", approxTime: "~90 s" },
  { steps: 150, label: "Extra quality (150 steps)",approxTime: "~135 s" },
] as const;

export type QualityTierSteps = typeof QUALITY_TIERS[number]["steps"];
