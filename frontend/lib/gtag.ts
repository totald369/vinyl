export const GA_MEASUREMENT_ID = "G-80ZYJJ27G5" as const;

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
