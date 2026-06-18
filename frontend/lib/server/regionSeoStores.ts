import { leafToRegionPath, type ResolvedRegionLeaf } from "@/lib/koreaRegions";
import type { StoreData } from "@/lib/storeData";
import { getRegionPathBucket, getStoreSearchIndexes } from "@/lib/server/storeIndex";

/** 지역 leaf에 속한 판매처 전체 (SEO 집계용) */
export function getStoresForRegionLeaf(leaf: ResolvedRegionLeaf): StoreData[] {
  try {
    const idx = getStoreSearchIndexes();
    return getRegionPathBucket(idx, leafToRegionPath(leaf), leaf.needles);
  } catch {
    return [];
  }
}

/** 주소 키워드(예: 강남구)로 판매처 필터 — district trashbag SEO용 */
export function getStoresForDistrictKeyword(keyword: string): StoreData[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  try {
    const idx = getStoreSearchIndexes();
    const out: StoreData[] = [];
    for (const s of idx.byId.values()) {
      const blob = idx.addressBlobLowerById.get(s.id) ?? "";
      if (blob.includes(kw)) out.push(s);
    }
    return out;
  } catch {
    return [];
  }
}
