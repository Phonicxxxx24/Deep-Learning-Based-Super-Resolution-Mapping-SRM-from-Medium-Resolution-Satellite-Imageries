"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Waves,
  Building2,
  Landmark,
  Mountain,
  AlertTriangle,
  TreePine,
} from "lucide-react";

export interface PresetLocation {
  name: string;
  desc: string;
  category?: string;
  lat: number;
  lon: number;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

export const DEFAULT_PRESET_AOIS: PresetLocation[] = [
  {
    name: "Mumbai Port",
    desc: "Coastal Harbour",
    category: "Coastal",
    lat: 18.9600,
    lon: 72.8200,
    icon: Waves,
  },
  {
    name: "Ahmedabad Urban",
    desc: "Built-up Core",
    category: "Urban",
    lat: 23.0225,
    lon: 72.5714,
    icon: Building2,
  },
  {
    name: "Berlin Centre",
    desc: "European Capital",
    category: "Capital",
    lat: 52.5200,
    lon: 13.4050,
    icon: Landmark,
  },
  {
    name: "Uttarakhand",
    desc: "Glacial Valley",
    category: "Topography",
    lat: 30.3800,
    lon: 79.7200,
    icon: Mountain,
  },
  {
    name: "Derna Coast",
    desc: "Flood Plain",
    category: "Flood Plain",
    lat: 32.7600,
    lon: 22.6300,
    icon: AlertTriangle,
  },
  {
    name: "Sundarbans Delta",
    desc: "Mangrove Wetland",
    category: "Wetland",
    lat: 21.9400,
    lon: 89.1800,
    icon: TreePine,
  },
];

interface QuickPresetsSidebarProps {
  selectedLocation?: { lat: number; lon: number } | null;
  onSelectLocation: (lat: number, lon: number, name?: string) => void;
  className?: string;
}

export default function QuickPresetsSidebar({
  selectedLocation,
  onSelectLocation,
  className = "",
}: QuickPresetsSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      initial={{ x: -28, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={`z-20 pointer-events-auto font-sans select-none ${className}`}
      aria-label="Quick satellite presets"
    >
      <div className="ios-glass-card rounded-[26px] border border-white/15 p-3 sm:p-3.5 shadow-2xl flex flex-col gap-2.5 backdrop-blur-2xl">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Compass size={14} />
            </div>
            {!collapsed && (
              <div>
                <h3 className="text-xs font-semibold text-white/90 tracking-tight">
                  Satellite Presets
                </h3>
                <p className="text-[10px] text-white/50 leading-none">
                  Iconic Observation AOIs
                </p>
              </div>
            )}
          </div>

          {/* Collapse Toggle */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
            title={collapsed ? "Expand Presets" : "Collapse Presets"}
            aria-label={collapsed ? "Expand presets" : "Collapse presets"}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </motion.button>
        </div>

        {/* Presets List */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="flex flex-col gap-1.5 w-[210px] sm:w-[230px]"
            >
              {DEFAULT_PRESET_AOIS.map((aoi) => {
                const isSelected =
                  selectedLocation &&
                  Math.abs(selectedLocation.lat - aoi.lat) < 0.01 &&
                  Math.abs(selectedLocation.lon - aoi.lon) < 0.01;

                const IconComponent = aoi.icon || MapPin;

                return (
                  <motion.button
                    key={aoi.name}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ x: 2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    type="button"
                    onClick={() => onSelectLocation(aoi.lat, aoi.lon, aoi.name)}
                    className={`w-full p-2 rounded-xl text-left transition-all flex items-center gap-2.5 cursor-pointer relative ${
                      isSelected
                        ? "bg-white text-black font-semibold shadow-md border border-white"
                        : "ios-glass-subtle hover:bg-white/12 text-white border border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-black/10 text-black"
                          : "bg-white/10 text-white"
                      }`}
                    >
                      <IconComponent size={14} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-xs block font-medium truncate leading-tight ${
                          isSelected ? "text-black font-semibold" : "text-white"
                        }`}
                      >
                        {aoi.name}
                      </span>
                      <span
                        className={`text-[10px] block truncate leading-tight mt-0.5 ${
                          isSelected ? "text-black/60" : "text-white/50"
                        }`}
                      >
                        {aoi.desc}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed Pill view */}
        {collapsed && (
          <div className="flex flex-col items-center gap-1.5 py-1">
            {DEFAULT_PRESET_AOIS.map((aoi) => {
              const isSelected =
                selectedLocation &&
                Math.abs(selectedLocation.lat - aoi.lat) < 0.01 &&
                Math.abs(selectedLocation.lon - aoi.lon) < 0.01;
              const IconComponent = aoi.icon || MapPin;

              return (
                <motion.button
                  key={aoi.name}
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  type="button"
                  onClick={() => onSelectLocation(aoi.lat, aoi.lon, aoi.name)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white text-black shadow-md border border-white"
                      : "ios-glass-subtle text-white/70 hover:text-white border border-white/10 hover:bg-white/15"
                  }`}
                  title={`${aoi.name} (${aoi.desc})`}
                >
                  <IconComponent size={14} />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </motion.aside>
  );
}
