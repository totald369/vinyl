import type { StoreData } from "@/lib/storeData";

/** id 기준 안정 정렬 후 상한까지 잘라 SEO용 링크/사이트맵에 재사용 */
export function sliceStoresStableForSeo(rows: StoreData[], limit: number): StoreData[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const cap = Math.floor(limit);
  return [...rows]
    .filter((s) => typeof s.id === "string" && s.id.length > 0)
    .sort((a, b) => {
      const c = a.id.localeCompare(b.id, undefined, { sensitivity: "base", numeric: true });
      if (c !== 0) return c;
      return a.name.localeCompare(b.name, "ko");
    })
    .slice(0, cap);
}
