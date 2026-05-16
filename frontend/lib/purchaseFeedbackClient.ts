import type { PurchaseFeedbackType } from "@/lib/purchaseFeedbackStorage";

export type PurchaseFeedbackStats = {
  successCount: number;
  failureCount: number;
};

export type PurchaseFeedbackSubmitResult = PurchaseFeedbackStats & {
  /** Supabase 미연결 등으로 서버에 저장되지 않았을 때 false — 클라이언트 낙관 카운트 유지 */
  persisted: boolean;
};

/**
 * 변경 전: 시트가 열릴 때마다 stats 를 매번 fetch (cache: no-store) → 동일 매장 재오픈에도 RTT.
 * 변경 후: storeId 키로 30초 TTL 메모리 캐시 + in-flight 디듀프.
 *          `getCachedPurchaseFeedbackStats` 가 있으면 시트는 즉시 카운트 표시,
 *          submit 시 stats 도 즉시 갱신해 정합성 유지(`primePurchaseFeedbackStats`).
 */
type StatsCacheEntry = { ts: number; data: PurchaseFeedbackStats };
const STATS_TTL_MS = 30_000;
const statsCache = new Map<string, StatsCacheEntry>();
const statsInflight = new Map<string, Promise<PurchaseFeedbackStats>>();

export function getCachedPurchaseFeedbackStats(storeId: string): PurchaseFeedbackStats | null {
  const e = statsCache.get(storeId);
  if (!e) return null;
  if (Date.now() - e.ts > STATS_TTL_MS) return null;
  return e.data;
}

export function primePurchaseFeedbackStats(storeId: string, data: PurchaseFeedbackStats): void {
  statsCache.set(storeId, { ts: Date.now(), data });
}

async function fetchPurchaseFeedbackStatsRaw(storeId: string): Promise<PurchaseFeedbackStats> {
  const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/purchase-feedback`, {
    method: "GET",
    cache: "no-store"
  });
  if (!res.ok) {
    return { successCount: 0, failureCount: 0 };
  }
  const json = (await res.json()) as unknown;
  if (!json || typeof json !== "object") return { successCount: 0, failureCount: 0 };
  const successCount = Number((json as { successCount?: unknown }).successCount);
  const failureCount = Number((json as { failureCount?: unknown }).failureCount);
  return {
    successCount: Number.isFinite(successCount) ? Math.max(0, Math.floor(successCount)) : 0,
    failureCount: Number.isFinite(failureCount) ? Math.max(0, Math.floor(failureCount)) : 0
  };
}

export async function getPurchaseFeedbackStats(storeId: string): Promise<PurchaseFeedbackStats> {
  const pending = statsInflight.get(storeId);
  if (pending) return pending;
  const p = fetchPurchaseFeedbackStatsRaw(storeId)
    .then((data) => {
      primePurchaseFeedbackStats(storeId, data);
      return data;
    })
    .finally(() => {
      statsInflight.delete(storeId);
    });
  statsInflight.set(storeId, p);
  return p;
}

/**
 * [INP/UX] 사용자가 row 를 hover/touch 한 시점(=prefetchStoreDetail 와 같은 timing)에 호출.
 * - 30s TTL cache + in-flight dedup 로 트래픽 폭증 방지(같은 매장 hover 연쇄 → 1회 fetch).
 * - 시트가 열리는 순간 `getCachedPurchaseFeedbackStats` 가 hit 되어 placeholder 깜빡임 제거.
 * - 캐시 hit 이거나 in-flight 중이면 즉시 return (fire-and-forget).
 */
export function prefetchPurchaseFeedbackStats(storeId: string): void {
  if (!storeId) return;
  if (getCachedPurchaseFeedbackStats(storeId) != null) return;
  if (statsInflight.has(storeId)) return;
  void getPurchaseFeedbackStats(storeId).catch(() => {
    /* 네트워크·서버 일시 오류 — 무시. 시트 열 때 자체 fetch 가 다시 시도. */
  });
}

export async function submitPurchaseFeedback(
  storeId: string,
  feedbackType: PurchaseFeedbackType,
  deviceKey: string
): Promise<PurchaseFeedbackSubmitResult> {
  const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/purchase-feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedbackType, deviceKey })
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const o = json && typeof json === "object" ? (json as { error?: unknown; debug?: unknown }) : null;
    const errStr = typeof o?.error === "string" ? o.error : null;
    const dbg = typeof o?.debug === "string" ? o.debug : null;
    const msg = dbg ?? errStr ?? "request failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[submitPurchaseFeedback]", { status: res.status, error: errStr, debug: dbg, body: json });
    }
    throw new Error(msg);
  }
  if (!json || typeof json !== "object") {
    throw new Error("invalid response");
  }
  const successCount = Number((json as { successCount?: unknown }).successCount);
  const failureCount = Number((json as { failureCount?: unknown }).failureCount);
  const persisted = (json as { persisted?: unknown }).persisted !== false;
  return {
    successCount: Number.isFinite(successCount) ? Math.max(0, Math.floor(successCount)) : 0,
    failureCount: Number.isFinite(failureCount) ? Math.max(0, Math.floor(failureCount)) : 0,
    persisted
  };
}
