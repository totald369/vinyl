"use client";

import { create } from "zustand";
import { mockStores } from "@/lib/mock";
import {
  ContentState,
  DEFAULT_REGION,
  FilterType,
  ListMode,
  PermissionState,
  StoreItem
} from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

type AppState = {
  permission: PermissionState;
  listMode: ListMode;
  contentState: ContentState;
  query: string;
  selectedFilters: FilterType[];
  userLocation: { lat: number; lng: number } | null;
  stores: StoreItem[];
  filteredStores: StoreItem[];
  errorMessage?: string;
  bootstrap: () => Promise<void>;
  setQuery: (query: string) => void;
  toggleFilter: (filter: FilterType) => void;
  setListMode: (mode: ListMode) => void;
  refreshList: () => void;
};

function applyList({
  stores,
  query,
  selectedFilters,
  listMode,
  userLocation
}: {
  stores: StoreItem[];
  query: string;
  selectedFilters: FilterType[];
  listMode: ListMode;
  userLocation: { lat: number; lng: number } | null;
}): StoreItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  let next = [...stores];

  if (selectedFilters.length > 0) {
    next = next.filter((store) =>
      selectedFilters.every((filter) => store.products.includes(filter))
    );
  }

  if (normalizedQuery) {
    next = next.filter(
      (store) =>
        store.name.toLowerCase().includes(normalizedQuery) ||
        store.address.toLowerCase().includes(normalizedQuery)
    );
  }

  const origin =
    listMode === "myLocation" && userLocation
      ? userLocation
      : { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng };

  next = next
    .map((store) => ({
      ...store,
      distanceKm: getDistanceKm(origin.lat, origin.lng, store.lat, store.lng)
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return next;
}

export const useAppStore = create<AppState>((set, get) => ({
  permission: "unknown",
  listMode: "defaultRegion",
  contentState: "loading",
  query: "",
  selectedFilters: [],
  userLocation: null,
  stores: [],
  filteredStores: [],
  errorMessage: undefined,

  bootstrap: async () => {
    set({ contentState: "loading", errorMessage: undefined });

    try {
      const stores = mockStores;
      if (typeof window !== "undefined" && "geolocation" in navigator) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              set({
                permission: "granted",
                listMode: "myLocation",
                userLocation: {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude
                }
              });
              resolve();
            },
            () => {
              set({
                permission: "denied",
                listMode: "defaultRegion",
                userLocation: null
              });
              resolve();
            },
            { timeout: 8000 }
          );
        });
      } else {
        set({
          permission: "denied",
          listMode: "defaultRegion",
          userLocation: null
        });
      }

      const state = get();
      const filtered = applyList({
        stores,
        query: state.query,
        selectedFilters: state.selectedFilters,
        listMode: state.listMode,
        userLocation: state.userLocation
      });

      set({
        stores,
        filteredStores: filtered,
        contentState: filtered.length === 0 ? "empty" : "ready"
      });
    } catch (error) {
      set({
        contentState: "error",
        errorMessage: error instanceof Error ? error.message : "알 수 없는 오류"
      });
    }
  },

  setQuery: (query) => {
    set({ query });
    get().refreshList();
  },

  toggleFilter: (filter) => {
    const current = get().selectedFilters;
    const selectedFilters = current.includes(filter)
      ? current.filter((item) => item !== filter)
      : [...current, filter];
    set({ selectedFilters });
    get().refreshList();
  },

  setListMode: (mode) => {
    const { permission } = get();
    if (mode === "myLocation" && permission !== "granted") {
      set({ listMode: "defaultRegion" });
    } else {
      set({ listMode: mode });
    }
    get().refreshList();
  },

  refreshList: () => {
    const state = get();
    const filtered = applyList({
      stores: state.stores,
      query: state.query,
      selectedFilters: state.selectedFilters,
      listMode: state.listMode,
      userLocation: state.userLocation
    });
    set({
      filteredStores: filtered,
      contentState: filtered.length === 0 ? "empty" : "ready"
    });
  }
}));
