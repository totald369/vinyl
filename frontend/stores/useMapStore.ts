"use client";

import { create } from "zustand";
import { DEFAULT_REGION, LatLng, ListMode, SearchBounds } from "@/lib/types";

type MapStore = {
  center: LatLng;
  listMode: ListMode;
  mapMoved: boolean;
  bounds: SearchBounds | null;
  setListMode: (mode: ListMode) => void;
  setCenter: (center: LatLng) => void;
  setBounds: (bounds: SearchBounds) => void;
  markMapMoved: (moved: boolean) => void;
};

export const useMapStore = create<MapStore>((set) => ({
  center: { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng },
  listMode: "defaultRegion",
  mapMoved: false,
  bounds: null,
  setListMode: (listMode) => set({ listMode }),
  setCenter: (center) => set({ center }),
  setBounds: (bounds) => set({ bounds }),
  markMapMoved: (mapMoved) => set({ mapMoved })
}));
