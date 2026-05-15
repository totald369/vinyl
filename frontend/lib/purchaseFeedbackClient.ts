import type { PurchaseFeedbackType } from "@/lib/purchaseFeedbackStorage";

export type PurchaseFeedbackStats = {
  successCount: number;
  failureCount: number;
};

export type PurchaseFeedbackSubmitResult = PurchaseFeedbackStats & {
  /** Supabase 미연결 등으로 서버에 저장되지 않았을 때 false — 클라이언트 낙관 카운트 유지 */
  persisted: boolean;
};

export async function getPurchaseFeedbackStats(storeId: string): Promise<PurchaseFeedbackStats> {
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
