/** Vercel 등에서 `NEXT_PUBLIC_GA_MEASUREMENT_ID`로 덮어쓸 수 있습니다. */
export const GA_MEASUREMENT_ID =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()) ||
  "G-80ZYJJ27G5";

/**
 * 프로덕션에서만 켜두세요. 수집 확인 후 `NEXT_PUBLIC_GA_DEBUG` 제거 권장.
 * Console: [GA] 접두 / Network: googletagmanager.com, google-analytics.com/g/collect
 */
export const GA_DEBUG =
  typeof process !== "undefined" &&
  (process.env.NEXT_PUBLIC_GA_DEBUG === "1" || process.env.NEXT_PUBLIC_GA_DEBUG === "true");

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

function gaLog(...args: unknown[]) {
  if (GA_DEBUG) {
    console.log("[GA]", ...args);
  }
}

/**
 * 클라이언트 라우트 전환 시 page_view (최초 로드는 layout의 gtag('config') 1회).
 *
 * 테스트(프로덕션 + NEXT_PUBLIC_GA_DEBUG=1):
 * - Console: [GA] page_view (route)
 * - Network: g/collect
 */
export function sendGtagPageView(path: string) {
  if (typeof window === "undefined") return;
  gaLog("page_view (route)", path);

  if (typeof window.gtag === "function") {
    window.gtag("config", GA_MEASUREMENT_ID, { page_path: path });
    return;
  }

  const dl = (window.dataLayer ??= []);
  dl.push(["config", GA_MEASUREMENT_ID, { page_path: path }]);
}

/** GA4 맞춤 이벤트 (프로덕션에서만 전송) */
export function sendGtagEvent(
  eventName: GtagCustomEventName,
  params?: Record<string, string | number | boolean | undefined>
) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") {
    return;
  }
  const cleaned = params
    ? Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
      )
    : undefined;

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, cleaned);
    return;
  }

  (window.dataLayer ??= []).push(["event", eventName, cleaned]);
}
