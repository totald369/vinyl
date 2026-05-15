import { getStoreSearchIndexes } from "@/lib/server/storeIndex";

/**
 * 변경 전: getMergedStores().find — 매 호출마다 ~7만 건 선형 스캔(O(n)).
 * 변경 후: 모듈 레벨 lazy singleton 인덱스의 byId 맵으로 O(1) 조회.
 *          (인덱스는 /api/stores 와 공유되어 첫 요청 이후 추가 비용 없음)
 * 측정: /stores/[id] TTFB(특히 워밍 후 p50/p95).
 */
export function getMergedStoreById(id: string) {
  const trimmed = id?.trim() ?? "";
  if (!trimmed) return undefined;
  return getStoreSearchIndexes().byId.get(trimmed);
}
