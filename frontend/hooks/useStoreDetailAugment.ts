"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { StoreData } from "@/lib/storeData";
import type { LatLng } from "@/lib/types";
import {
  fetchStoreDetail,
  getCachedStoreDetail,
  storeRowNeedsDetailFetch
} from "@/lib/storeDetailClient";

/**
 * When the sheet opens on a list row (lean API payload), fetch full detail by id and merge.
 * Re-opening the same store uses the client cache (see storeDetailClient).
 */
export function useStoreDetailAugment(
  sheetView: "list" | "detail",
  selectedStore: StoreData | null,
  origin: LatLng,
  setSelectedStore: Dispatch<SetStateAction<StoreData | null>>
): boolean {
  const [detailLoading, setDetailLoading] = useState(false);

  /* Narrow deps: we only re-fetch when id / sheet / origin changes, not on every selectedStore field update */
  useEffect(() => {
    if (sheetView !== "detail" || !selectedStore) {
      setDetailLoading(false);
      return;
    }
    if (!storeRowNeedsDetailFetch(selectedStore)) {
      setDetailLoading(false);
      return;
    }

    const cached = getCachedStoreDetail(selectedStore.id, origin);
    if (cached) {
      setSelectedStore((p) => (p?.id === cached.id ? cached : p));
      setDetailLoading(false);
      return;
    }

    const ac = new AbortController();
    setDetailLoading(true);
    void fetchStoreDetail(selectedStore.id, origin, { signal: ac.signal })
      .then((full) => {
        setSelectedStore((p) => (p?.id === full.id ? full : p));
      })
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setDetailLoading(false);
      });

    return () => ac.abort();
  }, [
    sheetView,
    selectedStore?.id,
    selectedStore?.dataReferenceDate,
    origin.lat,
    origin.lng,
    setSelectedStore
  ]);

  return detailLoading;
}
