# Feature Proposal & Architecture: 3D Interactive Globe Navigator

## 1. Overview & Purpose
This document captures the design, performance architecture, and technical implementation plan for the **Interactive 3D Globe Navigator**. This feature enables users to spin an interactive Earth globe in 3D, click any country or crisis hotspot, and seamlessly transition into the high-resolution (10m → 2.5m) 2D Sentinel-2 satellite selection canvas.

---

## 2. Performance & Zero-Lag Strategy
To prevent frame drops, GPU battery drain, and network lag:
1. **Lightweight WebGL Renderer**:
   - Use Three.js with an optimized 2K/4K night/day Earth texture + GeoJSON country boundaries.
   - Bundle impact: `< 250 KB` gzip (lazy-loaded via Next.js dynamic import with `ssr: false`).
2. **On-Demand Animation Loop**:
   - Pause `requestAnimationFrame` when the user is idle or after zooming in to the 2D map.
   - GPU usage drops to **0%** during standard 2D map browsing and super-resolution inference.
3. **Decoupled Architecture**:
   - Do **not** stream multi-gigabyte satellite tiles on the 3D sphere.
   - The 3D globe handles macro planetary navigation (zoom levels 0–4).
   - Once a country/region is chosen, the camera flies in, the globe cross-fades into the Leaflet high-res ESRI satellite canvas, and the 3D canvas is suspended.

---

## 3. User Workflow
1. **Planetary View**:
   - Header toggle button: `[ 🌐 3D Globe View ]` $\leftrightarrow$ `[ 🗺️ Satellite Canvas ]`.
   - The 3D Earth floats with atmospheric glow, day-night terminator, and interactive country borders.
2. **Target Selection**:
   - Hovering over a country highlights its border and displays its name.
   - Clicking a country or hotspot animates the camera toward that geographic centroid.
3. **Seamless Transition**:
   - At country scale (zoom ~5), the interface cross-fades smoothly into the 2D high-res satellite canvas centered at the exact target coordinates.
   - The user can then zoom in to street/building scale and drop their $1.28 \text{ km} \times 1.28 \text{ km}$ super-resolution footprint.

---

## 4. Implementation Steps (When Ready to Execute)
1. Add `three` and `@types/three` dependencies.
2. Create `frontend/src/components/Globe3DNavigator.tsx`:
   - Sphere geometry with Earth texture and atmospheric glow shader.
   - Raycasting for mouse hover and click events on country centroids / event hotspots.
   - Smooth camera tweening (using Slerp / OrbitControls).
3. Add View Mode state in `frontend/src/app/page.tsx` to toggle between `Globe` and `Map`.
4. Connect country click callback to `handleMapSelect(lat, lon)` and switch to 2D view.
