"use client";
/**
 * Globe3DNavigator
 * Physical 3D Satellite Earth:
 * Real photographic satellite imagery (4096x2048) and topographic relief draped
 * on a 3D Earth sphere. Dynamic high-resolution regional tile stitching on zoom.
 * Natural cursor-following orbit physics (drag direction matches hand movement).
 * Direct surface click sets reticle WITHOUT jumping or moving the camera.
 * Pure monochrome / Black & White aesthetic.
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Plus, Minus, RotateCcw, Crosshair, Sparkles } from "lucide-react";
import { NOTABLE_LOCATIONS } from "@/lib/constants";

/* ── Coordinate conversions ───────────────────────────────────────────── */
const GLOBE_RADIUS = 1.5;

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const norm = v.clone().normalize();
  const lat = 90 - Math.acos(norm.y) * (180 / Math.PI);
  let lon = (Math.atan2(norm.z, -norm.x) * (180 / Math.PI)) - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}

/* Slippy tile math for ESRI satellite tiles */
function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}
function tile2lon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

interface Globe3DNavigatorProps {
  selectedLocation?: { lat: number; lon: number } | null;
  onSelectLocation: (lat: number, lon: number, name?: string) => void;
}

export default function Globe3DNavigator({
  selectedLocation,
  onSelectLocation,
}: Globe3DNavigatorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [loadingTexture, setLoadingTexture] = useState<boolean>(true);
  const [highResActive, setHighResActive] = useState<boolean>(false);

  // References for external camera controls
  const flyToTargetRef = useRef<((lat: number, lon: number, radius?: number) => void) | null>(null);
  const loadHighResDetailRef = useRef<((lat: number, lon: number, customZoom?: number) => void) | null>(null);
  const zoomInRef = useRef<(() => void) | null>(null);
  const zoomOutRef = useRef<(() => void) | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const lastInternalSelectionRef = useRef<{ lat: number; lon: number } | null>(null);

  // When selectedLocation changes from outside (e.g. preset or search)
  useEffect(() => {
    if (!selectedLocation) return;

    // If this update was triggered by the user clicking directly on the 3D globe itself,
    // do NOT move the camera or rotate the globe! The globe must stay completely still.
    if (
      lastInternalSelectionRef.current &&
      Math.abs(lastInternalSelectionRef.current.lat - selectedLocation.lat) < 1e-4 &&
      Math.abs(lastInternalSelectionRef.current.lon - selectedLocation.lon) < 1e-4
    ) {
      lastInternalSelectionRef.current = null;
      return;
    }

    if (flyToTargetRef.current) {
      flyToTargetRef.current(selectedLocation.lat, selectedLocation.lon, 2.3);
    }
    if (loadHighResDetailRef.current) {
      loadHighResDetailRef.current(selectedLocation.lat, selectedLocation.lon);
    }
  }, [selectedLocation]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let destroyed = false;
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    /* ── WebGL Renderer ── */
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 1);
    mount.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    /* ── Scene & Camera ── */
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.035);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);
    camera.position.set(0, 0.5, 4.0);

    /* ── Deep Space Starfield ── */
    const starCount = 2800;
    const starCoords = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 25 + Math.random() * 20;
      starCoords[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starCoords[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starCoords[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x999999,
      size: 0.05,
      transparent: true,
      opacity: 0.75,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    /* ── Lighting ── */
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, -2, -3);
    scene.add(fillLight);

    /* ── Base Earth Sphere with 4096px Satellite Imagery ── */
    const textureLoader = new THREE.TextureLoader();
    const satelliteTexture = textureLoader.load("/earth-satellite.jpg", () => {
      if (!destroyed) setLoadingTexture(false);
    });
    satelliteTexture.colorSpace = THREE.SRGBColorSpace;
    satelliteTexture.generateMipmaps = true;
    satelliteTexture.minFilter = THREE.LinearMipmapLinearFilter;
    satelliteTexture.magFilter = THREE.LinearFilter;
    satelliteTexture.anisotropy = maxAnisotropy;

    const bumpTexture = textureLoader.load("/earth-topology.png");
    bumpTexture.anisotropy = maxAnisotropy;

    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: satelliteTexture,
      bumpMap: bumpTexture,
      bumpScale: 0.035,
      roughness: 0.65,
      metalness: 0.08,
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    /* ── Spherical Camera Orbit Coordinates ── */
    const sph = new THREE.Spherical(4.0, Math.PI / 2.2, 0);
    const targetSph = new THREE.Spherical(4.0, Math.PI / 2.2, 0);

    /* ── Dynamic High-Resolution Satellite Inset Patch ── */
    // Curved spherical mesh that renders high-res ESRI satellite tiles when zoomed in
    let highResMesh: THREE.Mesh | null = null;
    let highResTexture: THREE.CanvasTexture | null = null;
    let currentHighResCoords: { lat: number; lon: number; zoom: number } | null = null;

    const loadHighResDetail = (lat: number, lon: number, customZoom?: number) => {
      // Dynamic zoom tier: close-up zoom radius < 2.0 gets zoom 11 (76m/px!), < 2.6 gets zoom 10, else zoom 9
      const targetZoom = customZoom ?? (targetSph.radius < 2.0 ? 11 : targetSph.radius < 2.6 ? 10 : 9);

      if (
        currentHighResCoords &&
        currentHighResCoords.zoom === targetZoom &&
        Math.abs(currentHighResCoords.lat - lat) < 0.12 &&
        Math.abs(currentHighResCoords.lon - lon) < 0.12
      ) {
        return; // Already loaded for this immediate AOI at this zoom tier
      }
      currentHighResCoords = { lat, lon, zoom: targetZoom };

      const ZOOM = targetZoom;
      const cx = lon2tile(lon, ZOOM);
      const cy = lat2tile(lat, ZOOM);

      const xMin = cx - 1;
      const xMax = cx + 1;
      const yMin = cy - 1;
      const yMax = cy + 1;

      const lonMin = tile2lon(xMin, ZOOM);
      const lonMax = tile2lon(xMax + 1, ZOOM);
      const latMaxDeg = tile2lat(yMin, ZOOM);
      const latMinDeg = tile2lat(yMax + 1, ZOOM);

      const hAngleStart = (lonMin + 180) * (Math.PI / 180);
      const hAngleLength = (lonMax - lonMin) * (Math.PI / 180);
      const vAngleStart = (90 - latMaxDeg) * (Math.PI / 180);
      const vAngleLength = (latMaxDeg - latMinDeg) * (Math.PI / 180);

      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = 3 * 256;
      tileCanvas.height = 3 * 256;
      const tCtx = tileCanvas.getContext("2d");
      if (!tCtx) return;

      const patchGeo = new THREE.SphereGeometry(
        GLOBE_RADIUS + 0.0035,
        32,
        32,
        hAngleStart,
        hAngleLength,
        vAngleStart,
        vAngleLength
      );

      if (highResTexture) highResTexture.dispose();
      highResTexture = new THREE.CanvasTexture(tileCanvas);
      highResTexture.colorSpace = THREE.SRGBColorSpace;
      highResTexture.anisotropy = maxAnisotropy;

      const patchMat = new THREE.MeshBasicMaterial({
        map: highResTexture,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
      });

      if (highResMesh) {
        scene.remove(highResMesh);
        highResMesh.geometry.dispose();
      }

      highResMesh = new THREE.Mesh(patchGeo, patchMat);
      scene.add(highResMesh);
      setHighResActive(true);

      // Fetch 3x3 tiles asynchronously
      let loaded = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const tileY = yMin + r;
          const tileX = xMin + c;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (destroyed) return;
            tCtx.drawImage(img, c * 256, r * 256, 256, 256);
            loaded++;
            if (highResTexture) highResTexture.needsUpdate = true;
          };
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${tileY}/${tileX}`;
        }
      }
    };
    loadHighResDetailRef.current = loadHighResDetail;

    // Load initial high-res patch for selected location or India
    const initLat = selectedLocation?.lat ?? 18.96;
    const initLon = selectedLocation?.lon ?? 72.82;
    loadHighResDetail(initLat, initLon);

    /* ── Latitude / Longitude Graticule ── */
    const graticuleCanvas = document.createElement("canvas");
    graticuleCanvas.width = 2048;
    graticuleCanvas.height = 1024;
    const gCtx = graticuleCanvas.getContext("2d");
    if (gCtx) {
      gCtx.clearRect(0, 0, 2048, 1024);
      gCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      gCtx.lineWidth = 1;

      for (let lat = -75; lat <= 75; lat += 15) {
        const y = ((90 - lat) / 180) * 1024;
        gCtx.beginPath();
        gCtx.moveTo(0, y);
        gCtx.lineTo(2048, y);
        gCtx.stroke();
      }
      gCtx.strokeStyle = "rgba(255, 255, 255, 0.28)";
      gCtx.lineWidth = 1.5;
      gCtx.beginPath();
      gCtx.moveTo(0, 512);
      gCtx.lineTo(2048, 512);
      gCtx.stroke();

      gCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      gCtx.lineWidth = 1;
      for (let lon = -180; lon < 180; lon += 15) {
        const x = ((lon + 180) / 360) * 2048;
        gCtx.beginPath();
        gCtx.moveTo(x, 0);
        gCtx.lineTo(x, 1024);
        gCtx.stroke();
      }
    }
    const graticuleTexture = new THREE.CanvasTexture(graticuleCanvas);
    const graticuleMaterial = new THREE.MeshBasicMaterial({
      map: graticuleTexture,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const graticuleMesh = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS + 0.002, 64, 64),
      graticuleMaterial
    );
    scene.add(graticuleMesh);

    /* ── Atmospheric Rim Glow ── */
    const atmosphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.045, 64, 64);
    const atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphereMesh);

    /* ── Interactive Location Markers ── */
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    const markerGeometry = new THREE.CircleGeometry(0.016, 16);
    const markers: THREE.Mesh[] = [];

    NOTABLE_LOCATIONS.forEach((loc, idx) => {
      const pos = latLonToVector3(loc.lat, loc.lon, GLOBE_RADIUS + 0.008);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(markerGeometry.clone(), mat);
      mesh.position.copy(pos);
      mesh.lookAt(pos.clone().multiplyScalar(2));
      mesh.userData = { index: idx, loc };
      markerGroup.add(mesh);
      markers.push(mesh);
    });

    /* ── Target Selection Reticle ── */
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;
    scene.add(reticleGroup);

    const ringGeo = new THREE.RingGeometry(0.038, 0.044, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const reticleRing = new THREE.Mesh(ringGeo, ringMat);
    reticleGroup.add(reticleRing);

    const pulseRingGeo = new THREE.RingGeometry(0.02, 0.025, 24);
    const pulseRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
    reticleGroup.add(pulseRing);

    const centerDotGeo = new THREE.CircleGeometry(0.008, 16);
    const centerDotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const centerDot = new THREE.Mesh(centerDotGeo, centerDotMat);
    reticleGroup.add(centerDot);

    const updateReticle = (lat: number, lon: number) => {
      const pos = latLonToVector3(lat, lon, GLOBE_RADIUS + 0.012);
      reticleGroup.position.copy(pos);
      reticleGroup.lookAt(pos.clone().multiplyScalar(2));
      reticleGroup.visible = true;
    };

    if (selectedLocation) {
      updateReticle(selectedLocation.lat, selectedLocation.lon);
    }

    /* ── Spherical Camera Control ── */
    let flyAnimation: {
      startSph: THREE.Spherical;
      endSph: THREE.Spherical;
      startTime: number;
      duration: number;
    } | null = null;

    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let dragStart = { x: 0, y: 0 };
    const pointer = new THREE.Vector2(-9, -9);
    const raycaster = new THREE.Raycaster();
    let hoveredMarker: THREE.Mesh | null = null;

    /* Fly-to function (ONLY invoked for presets / coordinate search) */
    const flyToCoordinates = (lat: number, lon: number, customRadius = 2.4) => {
      const phi = THREE.MathUtils.clamp((90 - lat) * (Math.PI / 180), 0.15, Math.PI - 0.15);
      let theta = (lon + 180) * (Math.PI / 180);

      while (theta - targetSph.theta > Math.PI) theta -= 2 * Math.PI;
      while (theta - targetSph.theta < -Math.PI) theta += 2 * Math.PI;

      flyAnimation = {
        startSph: new THREE.Spherical(sph.radius, sph.phi, sph.theta),
        endSph: new THREE.Spherical(customRadius, phi, theta),
        startTime: performance.now(),
        duration: 1100,
      };
      updateReticle(lat, lon);
      loadHighResDetail(lat, lon);
    };
    flyToTargetRef.current = flyToCoordinates;

    // Debounced automatic high-res satellite sharpening when navigation/zoom settles
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerAutoDetail = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (targetSph.radius < 3.2 && !destroyed) {
          const centerCoords = vector3ToLatLon(camera.position);
          loadHighResDetail(centerCoords.lat, centerCoords.lon);
        }
      }, 220);
    };

    zoomInRef.current = () => {
      targetSph.radius = Math.max(1.58, targetSph.radius - 0.45);
      triggerAutoDetail();
    };
    zoomOutRef.current = () => {
      targetSph.radius = Math.min(6.5, targetSph.radius + 0.45);
    };
    resetViewRef.current = () => {
      flyAnimation = {
        startSph: new THREE.Spherical(sph.radius, sph.phi, sph.theta),
        endSph: new THREE.Spherical(4.0, Math.PI / 2.2, 0),
        startTime: performance.now(),
        duration: 1000,
      };
    };

    /* ── NATURAL CURSOR MOVEMENT PHYSICS ── */
    // Dragging right moves the surface right with the cursor! (theta -= dx)
    // Dragging down moves the surface down with the cursor! (phi -= dy)
    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        flyAnimation = null;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;

        // Natural 1:1 globe manipulation (matches Google Earth / OrbitControls)
        targetSph.theta -= dx * 0.0055;
        targetSph.phi = THREE.MathUtils.clamp(targetSph.phi - dy * 0.0055, 0.15, Math.PI - 0.15);

        prevMouse = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
      dragStart = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        triggerAutoDetail();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      flyAnimation = null;
      // Allow close zoom down to 1.58 (R = 1.50) for high-res detail
      targetSph.radius = THREE.MathUtils.clamp(targetSph.radius + e.deltaY * 0.003, 1.58, 6.5);
      triggerAutoDetail();
    };

    /* ── CLICK HANDLER ── */
    // Clicking on ANY area places reticle & selects AOI WITHOUT jumping or moving the camera!
    const onClick = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      if (dist > 6) return; // Ignore drag release

      raycaster.setFromCamera(pointer, camera);

      // Check click on preset location dots
      const markerHits = raycaster.intersectObjects(markers);
      if (markerHits.length > 0) {
        const hit = markerHits[0].object;
        const loc = hit.userData.loc as typeof NOTABLE_LOCATIONS[0];
        lastInternalSelectionRef.current = { lat: loc.lat, lon: loc.lon };
        updateReticle(loc.lat, loc.lon);
        loadHighResDetail(loc.lat, loc.lon);
        // DO NOT FLY CAMERA ON CLICK! Keep globe completely still.
        onSelectLocation(loc.lat, loc.lon, loc.name);
        return;
      }

      // Check click on Earth sphere surface
      const earthHits = raycaster.intersectObject(earthMesh);
      if (earthHits.length > 0) {
        const hitPoint = earthHits[0].point;
        const { lat, lon } = vector3ToLatLon(hitPoint);
        lastInternalSelectionRef.current = { lat, lon };
        updateReticle(lat, lon);
        loadHighResDetail(lat, lon);
        // DO NOT MOVE THE CAMERA ON SURFACE CLICK! The globe remains still.
        onSelectLocation(lat, lon);
      }
    };

    // Touch support for mobile/tablets
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      flyAnimation = null;
      const dx = e.touches[0].clientX - prevMouse.x;
      const dy = e.touches[0].clientY - prevMouse.y;
      targetSph.theta -= dx * 0.0055;
      targetSph.phi = THREE.MathUtils.clamp(targetSph.phi - dy * 0.0055, 0.15, Math.PI - 0.15);
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = () => {
      isDragging = false;
      triggerAutoDetail();
    };

    mount.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("mousedown", onMouseDown);
    mount.addEventListener("mouseup", onMouseUp);
    mount.addEventListener("mouseleave", onMouseUp);
    mount.addEventListener("wheel", onWheel, { passive: false });
    mount.addEventListener("click", onClick);
    mount.addEventListener("touchstart", onTouchStart, { passive: true });
    mount.addEventListener("touchmove", onTouchMove, { passive: true });
    mount.addEventListener("touchend", onTouchEnd);

    /* ResizeObserver */
    const ro = new ResizeObserver(() => {
      if (destroyed || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w > 0 && h > 0) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(mount);

    /* ── Render Loop ── */
    let animId = 0;
    let pulsePhase = 0;

    const render = () => {
      animId = requestAnimationFrame(render);

      // Smooth auto-rotation only when user is idle
      if (!isDragging && !flyAnimation) {
        targetSph.theta += 0.0003;
      }

      if (flyAnimation) {
        const now = performance.now();
        const progress = Math.min(1, (now - flyAnimation.startTime) / flyAnimation.duration);
        const t = 1 - Math.pow(1 - progress, 3);

        sph.radius = THREE.MathUtils.lerp(flyAnimation.startSph.radius, flyAnimation.endSph.radius, t);
        sph.phi = THREE.MathUtils.lerp(flyAnimation.startSph.phi, flyAnimation.endSph.phi, t);
        sph.theta = THREE.MathUtils.lerp(flyAnimation.startSph.theta, flyAnimation.endSph.theta, t);

        targetSph.radius = sph.radius;
        targetSph.phi = sph.phi;
        targetSph.theta = sph.theta;

        if (progress >= 1) flyAnimation = null;
      } else {
        sph.radius += (targetSph.radius - sph.radius) * 0.12;
        sph.phi += (targetSph.phi - sph.phi) * 0.12;
        sph.theta += (targetSph.theta - sph.theta) * 0.12;
      }

      camera.position.setFromSpherical(sph);
      camera.lookAt(0, 0, 0);

      // Pulse reticle
      if (reticleGroup.visible) {
        pulsePhase += 0.05;
        const pulseScale = 1 + Math.sin(pulsePhase) * 0.25;
        pulseRing.scale.set(pulseScale, pulseScale, 1);
        (pulseRing.material as THREE.MeshBasicMaterial).opacity =
          0.8 - (pulseScale - 0.75) * 0.8;
      }

      // Raycast hover detection
      raycaster.setFromCamera(pointer, camera);
      const markerHits = raycaster.intersectObjects(markers);
      const nextHoverMarker = markerHits.length > 0 ? (markerHits[0].object as THREE.Mesh) : null;

      if (nextHoverMarker !== hoveredMarker) {
        if (hoveredMarker) {
          (hoveredMarker.material as THREE.MeshBasicMaterial).color.set(0xffffff);
          (hoveredMarker.material as THREE.MeshBasicMaterial).opacity = 0.8;
          hoveredMarker.scale.set(1, 1, 1);
        }
        if (nextHoverMarker) {
          (nextHoverMarker.material as THREE.MeshBasicMaterial).color.set(0xffffff);
          (nextHoverMarker.material as THREE.MeshBasicMaterial).opacity = 1.0;
          nextHoverMarker.scale.set(2.2, 2.2, 1);
          const loc = nextHoverMarker.userData.loc as typeof NOTABLE_LOCATIONS[0];
          setHoverName(`${loc.name} · ${loc.desc}`);
          setHoverCoords({ lat: loc.lat, lon: loc.lon });
        } else {
          setHoverName(null);
        }
        hoveredMarker = nextHoverMarker;
      }

      if (!nextHoverMarker) {
        const earthHits = raycaster.intersectObject(earthMesh);
        if (earthHits.length > 0) {
          const { lat, lon } = vector3ToLatLon(earthHits[0].point);
          setHoverCoords({ lat, lon });
        } else {
          setHoverCoords(null);
        }
      }

      // Billboard orientation for marker dots
      markers.forEach((m) => {
        const toCam = camera.position.clone().sub(m.position).normalize();
        const normal = m.position.clone().normalize();
        const dotProduct = toCam.dot(normal);
        (m.material as THREE.MeshBasicMaterial).opacity = dotProduct > 0.1 ? 0.85 : 0;
      });

      renderer.render(scene, camera);
    };

    render();

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      ro.disconnect();
      mount.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("mousedown", onMouseDown);
      mount.removeEventListener("mouseup", onMouseUp);
      mount.removeEventListener("mouseleave", onMouseUp);
      mount.removeEventListener("wheel", onWheel);
      mount.removeEventListener("click", onClick);
      mount.removeEventListener("touchstart", onTouchStart);
      mount.removeEventListener("touchmove", onTouchMove);
      mount.removeEventListener("touchend", onMouseUp);

      renderer.dispose();
      earthGeometry.dispose();
      earthMaterial.dispose();
      satelliteTexture.dispose();
      bumpTexture.dispose();
      if (highResMesh) {
        scene.remove(highResMesh);
        highResMesh.geometry.dispose();
      }
      if (highResTexture) highResTexture.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full select-none overflow-hidden"
      style={{ background: "#000", cursor: "grab" }}
    >
      {/* Loading Overlay */}
      {loadingTexture && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xs gap-3">
          <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <span className="text-xs font-mono tracking-wider uppercase text-white/70">
            Draping High-Res Satellite Texture…
          </span>
        </div>
      )}

      {/* Top Banner / Inset Status */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <div
          className="px-3 py-1.5 rounded-lg flex items-center gap-2 border font-mono"
          style={{ background: "rgba(10, 10, 10, 0.85)", borderColor: "#222" }}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] font-bold text-white uppercase tracking-wider">
            Physical 3D Satellite Earth
          </span>
          {highResActive && (
            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-white text-black font-bold uppercase tracking-wider">
              HD Inset Ready
            </span>
          )}
        </div>

        {hoverName && (
          <div
            className="px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold text-white transition-opacity"
            style={{ background: "rgba(15, 15, 15, 0.9)", borderColor: "#333" }}
          >
            {hoverName}
          </div>
        )}
      </div>

      {/* Camera Control Cluster (Top Right) */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoomInRef.current?.()}
          title="Zoom In (High-Res Detail)"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          style={{ background: "rgba(12, 12, 12, 0.85)", border: "1px solid #222" }}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={() => zoomOutRef.current?.()}
          title="Zoom Out"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          style={{ background: "rgba(12, 12, 12, 0.85)", border: "1px solid #222" }}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => resetViewRef.current?.()}
          title="Reset View"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          style={{ background: "rgba(12, 12, 12, 0.85)", border: "1px solid #222" }}
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {/* Floating Bottom Presets Capsule Dock (inspired by Image 1) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 rounded-2xl border font-mono shadow-2xl overflow-x-auto max-w-[94%]"
        style={{
          background: "rgba(10, 10, 10, 0.92)",
          borderColor: "#222222",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#666] shrink-0 border-r border-[#222]">
          AOI Presets
        </div>
        {NOTABLE_LOCATIONS.map((loc) => {
          const isSel =
            selectedLocation &&
            Math.abs(selectedLocation.lat - loc.lat) < 0.05 &&
            Math.abs(selectedLocation.lon - loc.lon) < 0.05;
          return (
            <button
              key={loc.name}
              type="button"
              onClick={() => {
                lastInternalSelectionRef.current = { lat: loc.lat, lon: loc.lon };
                if (flyToTargetRef.current) {
                  flyToTargetRef.current(loc.lat, loc.lon, 2.3);
                }
                if (loadHighResDetailRef.current) {
                  loadHighResDetailRef.current(loc.lat, loc.lon);
                }
                onSelectLocation(loc.lat, loc.lon, loc.name);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                isSel
                  ? "bg-white text-black shadow-md font-bold"
                  : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSel ? "bg-black" : "bg-white/40"
                }`}
              />
              <span>{loc.name}</span>
            </button>
          );
        })}
      </div>

      {/* Floating HUD Coordinates (Bottom Left) */}
      <div className="absolute bottom-5 left-4 z-10 pointer-events-none hidden sm:block">
        <div
          className="px-3.5 py-1.5 rounded-xl flex items-center gap-2.5 border font-mono tabular-nums shadow-lg"
          style={{ background: "rgba(8, 8, 8, 0.9)", borderColor: "#222" }}
        >
          <Crosshair size={12} className="text-white/60 shrink-0" />
          {hoverCoords ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[#777]">Target:</span>
              <span className="font-bold text-white">
                {Math.abs(hoverCoords.lat).toFixed(4)}° {hoverCoords.lat >= 0 ? "N" : "S"},{" "}
                {Math.abs(hoverCoords.lon).toFixed(4)}° {hoverCoords.lon >= 0 ? "E" : "W"}
              </span>
            </div>
          ) : selectedLocation ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[#777]">Locked AOI:</span>
              <span className="font-bold text-white">
                {Math.abs(selectedLocation.lat).toFixed(4)}° {selectedLocation.lat >= 0 ? "N" : "S"},{" "}
                {Math.abs(selectedLocation.lon).toFixed(4)}° {selectedLocation.lon >= 0 ? "E" : "W"}
              </span>
            </div>
          ) : (
            <span className="text-xs text-[#777]">
              Click surface to lock 1.28 km AOI
            </span>
          )}
        </div>
      </div>

      {/* Instructions & Attribution (Bottom Right) */}
      <div
        className="absolute bottom-5 right-4 z-10 text-[9.5px] font-mono text-[#555] pointer-events-none hidden md:block"
      >
        ESRI High-Res World Imagery · Blue Marble
      </div>
    </div>
  );
}
