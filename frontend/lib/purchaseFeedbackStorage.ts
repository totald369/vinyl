import {
  PURCHASE_FEEDBACK_LIMIT_HOURS,
  purchaseFeedbackStorageKey
} from "@/lib/purchaseFeedbackConstants";

export type PurchaseFeedbackType = "success" | "failure";

export type StoredPurchaseFeedback = {
  type: PurchaseFeedbackType;
  submittedAt: string;
};

const MS_PER_HOUR = 60 * 60 * 1000;

function parseRecord(raw: string | null): StoredPurchaseFeedback | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const type = (o as { type?: unknown }).type;
    const submittedAt = (o as { submittedAt?: unknown }).submittedAt;
    if (type !== "success" && type !== "failure") return null;
    if (typeof submittedAt !== "string" || !submittedAt) return null;
    return { type, submittedAt };
  } catch {
    return null;
  }
}

export function hasSubmittedPurchaseFeedback(storeId: string): boolean {
  if (typeof window === "undefined") return false;
  const rec = parseRecord(window.localStorage.getItem(purchaseFeedbackStorageKey(storeId)));
  if (!rec) return false;
  const t = Date.parse(rec.submittedAt);
  if (Number.isNaN(t)) return false;
  const limitMs = PURCHASE_FEEDBACK_LIMIT_HOURS * MS_PER_HOUR;
  return Date.now() - t < limitMs;
}

export function readPurchaseFeedbackSubmission(storeId: string): StoredPurchaseFeedback | null {
  if (typeof window === "undefined") return null;
  const rec = parseRecord(window.localStorage.getItem(purchaseFeedbackStorageKey(storeId)));
  if (!rec) return null;
  const t = Date.parse(rec.submittedAt);
  if (Number.isNaN(t)) return null;
  const limitMs = PURCHASE_FEEDBACK_LIMIT_HOURS * MS_PER_HOUR;
  if (Date.now() - t >= limitMs) return null;
  return rec;
}

export function markPurchaseFeedbackSubmitted(storeId: string, feedbackType: PurchaseFeedbackType): void {
  if (typeof window === "undefined") return;
  const payload: StoredPurchaseFeedback = {
    type: feedbackType,
    submittedAt: new Date().toISOString()
  };
  window.localStorage.setItem(purchaseFeedbackStorageKey(storeId), JSON.stringify(payload));
}
