import { DISTRICT_TRASHBAG_PAGES } from "@/lib/districtTrashbagSeo";
import { enumerateRegionIndexEntries } from "@/lib/koreaRegions";
import { expandProvinceAliasesForSearch } from "@/lib/koreaProvinceAliases";
import type { RegionSeoSummaryFile, StoredRegionSeoSummary } from "@/lib/regionSeoSummary";
import type { StoreData } from "@/lib/storeData";
import { getRegionProductSummary } from "@/lib/seo";

function matchesAllNeedles(blobLower: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    const t = (n ?? "").trim().toLowerCase();
    if (!t) continue;
    if (!blobLower.includes(t)) return false;
  }
  return true;
}

function addressBlobLower(store: StoreData): string {
  const road = (store.roadAddress ?? "").trim();
  const addr = (store.address ?? "").trim();
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  return expandProvinceAliasesForSearch(norm(`${road} ${addr}`));
}

function toStoredSummary(stores: StoreData[]): StoredRegionSeoSummary {
  const summary = getRegionProductSummary(stores);
  return {
    storeCount: stores.length,
    hasTrashBag: summary.hasTrashBag,
    hasSpecialBag: summary.hasSpecialBag,
    hasLargeWasteSticker: summary.hasLargeWasteSticker
  };
}

/** 빌드 시점 1회 — 지역 pathKey·구 키워드별 품목 집계 */
export function buildRegionSeoSummaryFile(stores: StoreData[]): RegionSeoSummaryFile {
  const regions: Record<string, StoredRegionSeoSummary> = {};
  for (const entry of enumerateRegionIndexEntries()) {
    const bucket: StoreData[] = [];
    for (const store of stores) {
      if (matchesAllNeedles(addressBlobLower(store), entry.needles)) {
        bucket.push(store);
      }
    }
    regions[entry.pathKey] = toStoredSummary(bucket);
  }

  const districtKeywords: Record<string, StoredRegionSeoSummary> = {};
  for (const cfg of DISTRICT_TRASHBAG_PAGES) {
    const kw = cfg.addressKeyword.trim().toLowerCase();
    const bucket = stores.filter((store) => addressBlobLower(store).includes(kw));
    districtKeywords[kw] = toStoredSummary(bucket);
  }

  return { regions, districtKeywords };
}
