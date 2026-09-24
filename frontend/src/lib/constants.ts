export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export const PATCH_SIZE_PX = 128;   // LR input patch size
export const SR_SCALE_4X   = 4;     // → 512px output (16× pixel density)
export const SR_SCALE_8X   = 8;     // → 2048px output (256× pixel density, 0.625m GSD)
export const LR_RES_M      = 10;    // metres per pixel (Sentinel-2 L2A)
export const SR_RES_M      = 2.5;   // default 4× metres per pixel
export const SR_RES_8X_M   = 0.625; // 8× sub-meter resolution (metres per pixel)

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
  { steps: 50,  label: "Fast (50 steps)",          approxTime: "~45 s" },
  { steps: 100, label: "Full quality (100 steps)",  approxTime: "~90 s" },
  { steps: 150, label: "Extra quality (150 steps)", approxTime: "~135 s" },
  { steps: 200, label: "Ultra quality (200 steps)", approxTime: "~180 s" },
] as const;

export type QualityTierSteps = typeof QUALITY_TIERS[number]["steps"];

export interface NotableLocation {
  name: string;
  desc: string;
  lat: number;
  lon: number;
}

export const NOTABLE_LOCATIONS: NotableLocation[] = [
  { name: "Mumbai Port",        desc: "Coastal Harbour",   lat: 18.9600, lon:  72.8200 },
  { name: "Ahmedabad Urban",    desc: "Built-up Basin",    lat: 23.0225, lon:  72.5714 },
  { name: "New Delhi Core",     desc: "Metropolitan",      lat: 28.6139, lon:  77.2090 },
  { name: "Uttarakhand Valley", desc: "Himalayan Terrain", lat: 30.3800, lon:  79.7200 },
  { name: "Sundarbans Delta",   desc: "Mangrove Wetland",  lat: 21.9400, lon:  89.1800 },
  { name: "Derna Coast",        desc: "Floodplain Area",   lat: 32.7600, lon:  22.6300 },
  { name: "Berlin Centre",      desc: "European Urban",    lat: 52.5200, lon:  13.4050 },
  { name: "London City",        desc: "Thames Valley",     lat: 51.5074, lon:  -0.1278 },
  { name: "Tokyo Bay",          desc: "Industrial Coast",  lat: 35.6762, lon: 139.6503 },
  { name: "New York Port",      desc: "Hudson Estuary",    lat: 40.7128, lon: -74.0060 },
  { name: "San Francisco",      desc: "Bay Area",          lat: 37.7749, lon:-122.4194 },
  { name: "Amazon Basin",       desc: "Dense Rainforest",  lat: -3.4653, lon: -62.2159 },
  { name: "Cairo Nile",         desc: "River Oasis",       lat: 30.0444, lon:  31.2357 },
  { name: "Sydney Harbour",     desc: "Ocean Port",        lat:-33.8688, lon: 151.2093 },
  { name: "Singapore Strait",   desc: "Maritime Hub",      lat:  1.3521, lon: 103.8198 },
  { name: "Dubai Coastline",    desc: "Desert Urban",      lat: 25.2048, lon:  55.2708 },
  { name: "Paris Central",      desc: "Seine Basin",       lat: 48.8566, lon:   2.3522 },
  { name: "Cape Town Coast",    desc: "Peninsula",         lat:-33.9249, lon:  18.4241 },
];
