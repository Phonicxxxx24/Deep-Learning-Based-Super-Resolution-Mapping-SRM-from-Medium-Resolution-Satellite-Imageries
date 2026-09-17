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
            color: "#00d4aa",
            fillColor: "#00d4aa",
            fillOpacity: 0.18,
            weight: 2,
            dashArray: "6 4",
          }).addTo(map);
        }

        // Move or create center dot
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.circleMarker([lat, lng], {
            radius: 5,
            color: "#00d4aa",
            fillColor: "#00d4aa",
            fillOpacity: 1,
            weight: 0,
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

        {/* Reference Layer 1: ESRI World Boundaries and Places (Cities, Towns, Borders) */}
        {showLabels && (
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
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

      {/* Layer Toggle Floating Button */}
      <div className="absolute top-4 right-4 z-[900]">
        <button
          type="button"
          onClick={() => setShowLabels((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer ${
            showLabels
              ? "bg-white/90 text-[#0066cc] border border-[#0066cc]/30 backdrop-blur-md"
              : "bg-white/60 text-[#6b7a99] border border-white/60 backdrop-blur-md"
          }`}
          title={showLabels ? "Click to hide map labels" : "Click to show city & street labels"}
        >
          <Layers size={13} />
          <span>Labels {showLabels ? "On" : "Off"}</span>
        </button>
      </div>
    </div>
  );
}
