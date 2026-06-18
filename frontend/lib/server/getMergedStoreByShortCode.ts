import "server-only";

import { isValidShortCode } from "@/lib/shortLink";
import { getStoreSearchIndexes } from "@/lib/server/storeIndex";

/** O(1) shortCode 조회 — 전체 배열 .find() 제거 */
export function getMergedStoreByShortCode(shortCode: string) {
  const key = shortCode?.trim() ?? "";
  if (!isValidShortCode(key)) return undefined;
  return getStoreSearchIndexes().byShortCode.get(key);
}
