import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { LatLng } from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

export function filterStoresForSearch(
  stores: StoreData[],
  query: string,
  filter: StoreListFilter,
  referencePoint: LatLng,
  limit = 100
): StoreData[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return stores
    .filter((s) => {
      if (filter === "largeSticker") return s.hasLargeWasteSticker;
      if (filter === "nonBurnable") return s.hasSpecialBag;
      return s.hasTrashBag;
    })
    .filter((s) => {
      const name = (s.name || "").toLowerCase();
      const addr = ((s.roadAddress || s.address) ?? "").toLowerCase();
      return name.includes(q) || addr.includes(q);
    })
    .map((s) => ({
      ...s,
      distance: getDistanceKm(referencePoint.lat, referencePoint.lng, s.lat, s.lng)
    }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, limit);
}
