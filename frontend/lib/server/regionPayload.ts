/**
 * SSR 용 region 첫 페이지 payload 빌더.
 *
 * 변경 전: /regions/[...slug]/page.tsx 가 Suspense fallback 만 렌더 → 클라이언트가
 *          마운트 후 /api/stores?regionPath=... 를 fetch (round-trip 1회).
 * 변경 후: server component 가 storeIndex 를 직접 사용해 첫 페이지 데이터를 빌드,
 *          RegionStoreListClient 에 props 로 inject.
 *          - 첫 페인트에 데이터 포함 (CSR fetch 1회 + spinner 시간 제거)
 *          - revalidate=600 (ISR) 으로 같은 페이지 재방문 시 origin 도달 0
 *          - 응답 shape 은 route.ts 와 동일 (toListStore) — 클라이언트 코드 영향 0
 * 측정: 첫 페인트까지의 TTI, /api/stores?regionPath=... 호출 수.
 */
import type { ResolvedRegionLeaf } from "@/lib/koreaRegions";
import { leafToRegionPath } from "@/lib/koreaRegions";
import type { StoreData } from "@/lib/storeData";
import { getStoreSearchIndexes } from "@/lib/server/storeIndex";
import {
  matchesProductFilter,
  toListStore,
  type ListStoreShape,
  type ProductFilter
} from "@/lib/server/storesApiShape";

import { REGION_LIST_PAGE_SIZE } from "@/lib/regionListConfig";

/** SSR inject 시 첫 페이지 크기 (현재 region page 는 클라이언트 fetch 만 사용). */
export const REGION_INITIAL_PAGE_LIMIT = REGION_LIST_PAGE_SIZE;

export type RegionInitialPayload = {
  mode: "region";
  category: ProductFilter;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  /** name 정렬된 첫 페이지. 거리 정렬은 클라이언트에서 사용자 위치 기준으로 수행. */
  stores: ListStoreShape[];
};

function matchesAllNeedles(blobLower: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    const t = (n ?? "").trim().toLowerCase();
    if (!t) continue;
    if (!blobLower.includes(t)) return false;
  }
  return true;
}

/**
 * 거리 정렬 없이 (lat/lng 미지정) name 정렬된 region 첫 페이지를 만든다.
 * 거리 정렬은 클라이언트에서 사용자 위치가 들어왔을 때만 수행하므로 SSR 단계에선 불필요.
 */
export function buildRegionInitialPayload(
  leaf: ResolvedRegionLeaf,
  category: ProductFilter
): RegionInitialPayload {
  let idx: ReturnType<typeof getStoreSearchIndexes>;
  try {
    idx = getStoreSearchIndexes();
  } catch {
    return {
      mode: "region",
      category,
      total: 0,
      offset: 0,
      limit: REGION_INITIAL_PAGE_LIMIT,
      hasMore: false,
      stores: []
    };
  }

  const regionPathKey = leafToRegionPath(leaf);
  const pathBucket = idx.byRegionPath.get(regionPathKey);

  let candidates: StoreData[];
  if (pathBucket !== undefined) {
    candidates = [];
    for (const s of pathBucket) {
      if (!matchesProductFilter(s, category)) continue;
      candidates.push(s);
    }
  } else {
    candidates = [];
    for (const s of idx.byId.values()) {
      if (!matchesProductFilter(s, category)) continue;
      const blob = idx.addressBlobLowerById.get(s.id) ?? "";
      if (!matchesAllNeedles(blob, leaf.needles)) continue;
      candidates.push(s);
    }
  }

  candidates.sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "ko", { sensitivity: "base" })
  );

  const total = candidates.length;
  const page = candidates.slice(0, REGION_INITIAL_PAGE_LIMIT);
  return {
    mode: "region",
    category,
    total,
    offset: 0,
    limit: REGION_INITIAL_PAGE_LIMIT,
    hasMore: total > page.length,
    stores: page.map((s) => toListStore(s))
  };
}
