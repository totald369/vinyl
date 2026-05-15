import { PURCHASE_FEEDBACK_DEVICE_KEY } from "@/lib/purchaseFeedbackConstants";

/** API `device_key` 및 중복 완화용 — 기기당 1회 생성해 localStorage에 유지 */
export function getOrCreateDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = window.localStorage.getItem(PURCHASE_FEEDBACK_DEVICE_KEY);
    if (!v) {
      v =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(PURCHASE_FEEDBACK_DEVICE_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}
