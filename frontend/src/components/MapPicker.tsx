"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap } from "react-leaflet";
import type { LatLng } from "leaflet";
import { Layers } from "lucide-react";
import {
  PATCH_FOOTPRINT_M,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/lib/constants";

interface MapPickerProps {
  onSelect: (lat: number, lon: number) => void;
  selectedPoint?: { lat: number; lon: number } | null;
  disabled?: boolean;
}

/** Synchronizes circle/marker when selectedPoint changes externally or via click. */
function SelectionController({
  selectedPoint,
  onSelect,
  disabled,
}: {
  selectedPoint?: { lat: number; lon: number } | null;
  onSelect: (lat: number, lon: number) => void;
  disabled: boolean;
}) {
  const circleRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const map = useMap();

  // Invalidate size once map mounts to guarantee visibility
  useEffect(() => {
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 100);
  }, [map]);

  const updateVisuals = (lat: number, lng: number) => {
    if (typeof window !== "undefined") {
      import("leaflet").then((L) => {
        // Move or create the patch footprint circle (1280m diameter)
        if (circleRef.current) {
          circleRef.current.setLatLng([lat, lng]);
        } else {
          circleRef.current = L.circle([lat, lng], {
            radius: PATCH_FOOTPRINT_M / 2,
            color: "#0066cc",
            fillColor: "#0066cc",
            fillOpacity: 0.14,
            weight: 2,
            dashArray: "4 4",
          }).addTo(map);
        }

        // Move or create center dot
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.circleMarker([lat, lng], {
            radius: 4,
            color: "#ffffff",
            fillColor: "#0066cc",
            fillOpacity: 1,
            weight: 2,
          }).addTo(map);
        }
      });
    }
  };

  // Listen to map clicks
  useMapEvents({
    click(e: { latlng: LatLng }) {
      if (disabled) return;
      const { lat, lng } = e.latlng;
      updateVisuals(lat, lng);
      onSelect(lat, lng);
    },
  });

  // Watch for external programmatic selection (e.g. quick city presets)
  useEffect(() => {
    if (selectedPoint) {
      updateVisuals(selectedPoint.lat, selectedPoint.lon);
      try {
        map.flyTo([selectedPoint.lat, selectedPoint.lon], Math.max(map.getZoom(), 12), {
          duration: 1.2,
        });
      } catch {}
    }
  }, [selectedPoint, map]);

  return null;
}

export default function MapPicker({
  onSelect,
  selectedPoint,
  disabled = false,
}: MapPickerProps) {
  const [mounted, setMounted] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="w-full h-full rounded-2xl flex items-center justify-center min-h-[500px]"
        style={{ background: "#ffffff" }}
      >
        <span className="text-sm animate-pulse text-[#6b7a99]">
          Loading satellite map with labels…
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[550px]" style={{ minHeight: "calc(100vh - 110px)" }}>
      <MapContainer
        center={selectedPoint ? [selectedPoint.lat, selectedPoint.lon] : DEFAULT_MAP_CENTER}
        zoom={selectedPoint ? 12 : DEFAULT_MAP_ZOOM}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "calc(100vh - 110px)",
          borderRadius: "1rem",
        }}
        zoomControl={true}
      >
        {/* Base Layer: ESRI High-Resolution World Imagery */}
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        {/* Reference Layer 1: CartoDB English World Labels (Strictly Latin / English names worldwide) */}
        {showLabels && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
            subdomains={["a", "b", "c", "d"]}
            maxZoom={19}
            opacity={0.95}
          />
        )}

        {/* Reference Layer 2: ESRI World Transportation (Roads & Streets) */}
        {showLabels && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.75}
          />
        )}

        <SelectionController
          selectedPoint={selectedPoint}
          onSelect={onSelect}
          disabled={disabled}
        />
      </MapContainer>

      {/* Floating Map HUD Information Badge */}
      <div className="absolute bottom-4 left-4 z-[900] pointer-events-none">
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md text-white border border-white/15 text-[11px] font-mono shadow-md flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0066cc] animate-pulse inline-block" />
          {selectedPoint ? (
            <span>
              Locked AOI: <strong className="text-white font-bold">{selectedPoint.lat.toFixed(4)}°N, {selectedPoint.lon.toFixed(4)}°E</strong> (1.28 × 1.28 km)
            </span>
          ) : (
            <span className="text-slate-300">
              Click anywhere on the map to define a 1.28 km Area of Interest
            </span>
          )}
        </div>
      </div>

      {/* Layer Toggle Floating Button */}
      <div className="absolute top-4 right-4 z-[900]">
        <button
          type="button"
          onClick={() => setShowLabels((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer active:scale-98 ${
            showLabels
              ? "bg-white/95 text-slate-800 border border-slate-200 backdrop-blur-md hover:bg-white"
              : "bg-white/70 text-slate-500 border border-slate-200 backdrop-blur-md hover:bg-white"
          }`}
          title={showLabels ? "Click to hide map labels" : "Click to show city & street labels"}
        >
          <Layers size={13} className="text-[#0066cc]" />
          <span>Labels: {showLabels ? "On" : "Off"}</span>
        </button>
      </div>
    </div>
  );
}
