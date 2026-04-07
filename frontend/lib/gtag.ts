/** Vercel 등에서 `NEXT_PUBLIC_GA_MEASUREMENT_ID`로 덮어쓸 수 있습니다. */
export const GA_MEASUREMENT_ID =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()) ||
  "G-80ZYJJ27G5";

export type GtagCustomEventName =
  | "click_my_location"
  | "click_report"
  | "click_marker"
  | "filter_select";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** 클라이언트 라우트 전환 시 GA4 page_view (최초 로드는 layout 인라인 config에서 처리) */
export function sendGtagPageView(path: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("config", GA_MEASUREMENT_ID, { page_path: path });
}

/** GA4 맞춤 이벤트 (프로덕션에서만 전송) */
export function sendGtagEvent(
  eventName: GtagCustomEventName,
  params?: Record<string, string | number | boolean | undefined>
) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production" || !window.gtag) {
    return;
  }
  const cleaned = params
    ? Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
      )
    : undefined;
  window.gtag("event", eventName, cleaned);
}
