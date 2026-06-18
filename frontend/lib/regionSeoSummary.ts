/** 빌드·런타임 공통 — 지역/키워드별 SEO 집계 결과 */
export type StoredRegionSeoSummary = {
  storeCount: number;
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
};

export type RegionSeoSummaryFile = {
  regions: Record<string, StoredRegionSeoSummary>;
  districtKeywords: Record<string, StoredRegionSeoSummary>;
};

export const REGION_SEO_SUMMARY_FILE = "_region_seo_summary.json";

export function districtKeywordCacheKey(keyword: string): string {
  return keyword.trim().toLowerCase();
}
