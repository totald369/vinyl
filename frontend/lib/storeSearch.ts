import type { StoreData } from "@/lib/storeData";
import type { StoreListFilter } from "@/hooks/useStores";
import { expandProvinceAliasesForSearch } from "@/lib/koreaProvinceAliases";
import { parseSearchTokens, textMatchesAllTokens } from "@/lib/searchTokens";
import { precomputeHangulTokens } from "@/lib/searchTokensHangul";
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
  const tokens = parseSearchTokens(query);
  if (!tokens.length) return [];
  const hangulTokens = precomputeHangulTokens(tokens);

  const sorted = stores
    .filter((s) => {
      if (filter === "nonBurnable") return s.hasSpecialBag;
      if (filter === "largeSticker") return s.hasLargeWasteSticker;
      return s.hasTrashBag;
    })
    .filter((s) => {
      const blob = expandProvinceAliasesForSearch(
        `${s.name ?? ""} ${(s.roadAddress || s.address) ?? ""}`
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim()
      );
      return textMatchesAllTokens(blob, tokens, hangulTokens);
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
