import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { LatLng } from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

/**
 * 검색어·필터에 맞는 매장을 거리순으로 정렬해 반환합니다.
 * @param limit 지정 시 그 개수만 잘라 반환(옵션). 미지정이면 전체 매칭 건수.
 */
export function filterStoresForSearch(
  stores: StoreData[],
  query: string,
  filter: StoreListFilter,
  referencePoint: LatLng,
  limit?: number
): StoreData[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const sorted = stores
    .filter((s) => {
      if (filter === "nonBurnable") return s.hasSpecialBag;
      if (filter === "largeSticker") return s.hasLargeWasteSticker;
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
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  if (typeof limit === "number" && limit >= 0) {
    return sorted.slice(0, limit);
  }
  return sorted;
}
