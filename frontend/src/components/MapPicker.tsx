"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap } from "react-leaflet";
import type { LatLng, Map as LeafletMap } from "leaflet";
import { Layers, Crosshair, Plus, Minus, Navigation } from "lucide-react";
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

/** Synchronizes circle/marker when selectedPoint changes externally or via click */
function MapInteractionsController({
  selectedPoint,
  onSelect,
  disabled,
  onMapReady,
}: {
  selectedPoint?: { lat: number; lon: number } | null;
  onSelect: (lat: number, lon: number) => void;
  disabled: boolean;
  onMapReady: (map: LeafletMap) => void;
}) {
  const circleRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [map, onMapReady]);

  const updateVisuals = (lat: number, lng: number) => {
    if (typeof window !== "undefined") {
      import("leaflet").then((L) => {
        // High-tech circular footprint representation (1280m diameter = 640m radius)
        if (circleRef.current) {
          circleRef.current.setLatLng([lat, lng]);
        } else {
          circleRef.current = L.circle([lat, lng], {
            radius: PATCH_FOOTPRINT_M / 2,
            color: "#ffffff",
            fillColor: "#ffffff",
            fillOpacity: 0.12,
            weight: 2,
            dashArray: "6 6",
          }).addTo(map);
        }

        // Target center pin marker
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.circleMarker([lat, lng], {
            radius: 5,
            color: "#ffffff",
            fillColor: "#000000",
            fillOpacity: 1,
            weight: 2.5,
          }).addTo(map);
        }
      });
    }
  };

  useMapEvents({
    click(e: { latlng: LatLng }) {
      if (disabled) return;
      const { lat, lng } = e.latlng;
      updateVisuals(lat, lng);
      onSelect(lat, lng);
    },
  });

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
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleZoomIn = () => {
    if (mapInstance) mapInstance.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstance) mapInstance.zoomOut();
  };

  const handleRecenter = () => {
    if (mapInstance && selectedPoint) {
      mapInstance.flyTo([selectedPoint.lat, selectedPoint.lon], 13, { duration: 1 });
    }
  };

  if (!mounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#06080e]">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-xs text-white/60 tracking-wide font-sans">
          Streaming High-Resolution Satellite Tiles…
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#06080e]">
      <MapContainer
        center={selectedPoint ? [selectedPoint.lat, selectedPoint.lon] : DEFAULT_MAP_CENTER}
        zoom={selectedPoint ? 12 : DEFAULT_MAP_ZOOM}
        style={{
          width: "100%",
          height: "100%",
          background: "#06080e",
        }}
        zoomControl={false}
      >
        {/* Base Layer: ESRI High-Resolution World Imagery */}
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        {/* Reference Layer 1: ESRI Official World Boundaries and Places (Clean, no API key required, no watermark) */}
        {showLabels && (
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.9}
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

        <MapInteractionsController
          selectedPoint={selectedPoint}
          onSelect={onSelect}
          disabled={disabled}
          onMapReady={setMapInstance}
        />
      </MapContainer>



      {/* Floating Left-Side Apple-style Map Controls Pill Stack */}
      <div className="absolute bottom-20 left-4 sm:left-6 z-[800] flex flex-col gap-2 pointer-events-auto">
        <div className="flex flex-col rounded-2xl ios-glass-pill p-1 shadow-2xl overflow-hidden backdrop-blur-2xl">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            title="Zoom In"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <div className="w-5 h-px bg-white/15 mx-auto my-0.5" />
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
        </div>

        {selectedPoint && (
          <button
            type="button"
            onClick={handleRecenter}
            className="w-10 h-10 rounded-2xl ios-glass-pill flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all shadow-xl cursor-pointer"
            title="Recenter to locked target"
            aria-label="Recenter to target"
          >
            <Crosshair size={16} className="text-white" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowLabels((prev) => !prev)}
          className={`w-10 h-10 rounded-2xl ios-glass-pill flex items-center justify-center transition-all shadow-xl cursor-pointer active:scale-95 ${
            showLabels
              ? "text-white bg-white/20 border-white/30"
              : "text-white/60 hover:text-white"
          }`}
          title={showLabels ? "Hide street and city labels" : "Show street and city labels"}
          aria-label="Toggle labels"
        >
          <Layers size={16} />
        </button>
      </div>

      {/* Floating Bottom Left Target Coordinates Info Badge */}
      <div className="absolute bottom-6 left-4 sm:left-6 z-[800] pointer-events-none">
        <div className="px-4 py-2 rounded-2xl ios-glass-card text-white text-xs shadow-2xl flex items-center gap-2.5 backdrop-blur-2xl pointer-events-auto border border-white/15">
          <Navigation size={13} className="text-white rotate-45 shrink-0" />
          {selectedPoint ? (
            <div className="flex items-center gap-2 font-sans">
              <span className="text-white/70 text-[11px]">Locked AOI:</span>
              <strong className="text-white font-mono font-medium text-[11.5px]">
                {Math.abs(selectedPoint.lat).toFixed(4)}°{selectedPoint.lat >= 0 ? "N" : "S"},{" "}
                {Math.abs(selectedPoint.lon).toFixed(4)}°{selectedPoint.lon >= 0 ? "E" : "W"}
              </strong>
              <span className="text-[10px] text-white/40 border-l border-white/15 pl-2 font-mono">
                1.28 × 1.28 km
              </span>
            </div>
          ) : (
            <span className="text-white/70 text-[11.5px] font-sans">
              Tap anywhere on the satellite surface to lock target AOI
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
