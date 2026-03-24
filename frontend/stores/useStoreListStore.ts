"use client";

import { create } from "zustand";
import { isPointInBounds } from "@/lib/geo";
import { mockStores } from "@/lib/mock";
import { getDistanceKm } from "@/lib/utils";
import { ContentState, DEFAULT_REGION, FilterType, LatLng, SearchBounds, StoreItem } from "@/lib/types";

type StoreListStore = {
  contentState: ContentState;
  query: string;
  selectedFilters: FilterType[];
  allStores: StoreItem[];
  visibleStores: StoreItem[];
  errorMessage?: string;
  initializeStores: (origin: LatLng) => void;
  setQuery: (query: string, origin: LatLng) => void;
  toggleFilter: (filter: FilterType, origin: LatLng) => void;
  filterByBounds: (bounds: SearchBounds, origin: LatLng) => void;
  applyAllFilters: (origin: LatLng, bounds?: SearchBounds | null) => void;
};

function withDistance(stores: StoreItem[], origin: LatLng): StoreItem[] {
  return stores
    .map((store) => ({
      ...store,
      distanceKm: getDistanceKm(origin.lat, origin.lng, store.lat, store.lng)
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export const useStoreListStore = create<StoreListStore>((set, get) => ({
  contentState: "loading",
  query: "",
  selectedFilters: [],
  allStores: [],
  visibleStores: [],
  errorMessage: undefined,

  initializeStores: (origin) => {
    const stores = mockStores;
    const fallbackOrigin = origin ?? { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng };
    const visibleStores = withDistance(stores, fallbackOrigin);
    set({
      allStores: stores,
      visibleStores,
      contentState: visibleStores.length ? "ready" : "empty",
      errorMessage: undefined
    });
  },

  setQuery: (query, origin) => {
    set({ query });
    get().applyAllFilters(origin);
  },

  toggleFilter: (filter, origin) => {
    const selectedFilters = get().selectedFilters.includes(filter)
      ? get().selectedFilters.filter((item) => item !== filter)
      : [...get().selectedFilters, filter];
    set({ selectedFilters });
    get().applyAllFilters(origin);
  },

  filterByBounds: (bounds, origin) => {
    get().applyAllFilters(origin, bounds);
  },

  applyAllFilters: (origin, bounds) => {
    try {
      const { allStores, query, selectedFilters } = get();
      const normalizedQuery = query.trim().toLowerCase();
      let next = [...allStores];

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

      if (bounds) {
        next = next.filter((store) => isPointInBounds({ lat: store.lat, lng: store.lng }, bounds));
      }

      const visibleStores = withDistance(next, origin);
      set({
        visibleStores,
        contentState: visibleStores.length ? "ready" : "empty",
        errorMessage: undefined
      });
    } catch (error) {
      set({
        contentState: "error",
        errorMessage: error instanceof Error ? error.message : "목록 처리 오류"
      });
    }
  }
}));
