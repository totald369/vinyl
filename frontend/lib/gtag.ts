const GA_DEFAULT_ID = "G-80ZYJJ27G5";

function resolveGaMeasurementId(): string {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() : "";
  if (raw && /^G-[A-Z0-9]+$/i.test(raw)) {
    return raw;
  }
  return GA_DEFAULT_ID;
}

/** Vercel 등에서 `NEXT_PUBLIC_GA_MEASUREMENT_ID`로 덮어쓸 수 있습니다. 잘못된 값·빈 값은 기본값으로 대체합니다. */
export const GA_MEASUREMENT_ID = resolveGaMeasurementId();

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

const GTAG_RETRY_MS = 50;
const GTAG_RETRY_MAX = 20;

/**
 * 클라이언트 라우트 전환 시 page_view (최초 로드는 GoogleAnalyticsScripts의 gtag('config') 1회).
 * gtag가 아직 붙기 전에 라우트가 바뀌는 경우를 위해 짧게 재시도합니다.
 */
export function sendGtagPageView(path: string) {
  if (typeof window === "undefined") return;
  gaLog("page_view (route)", path);

  const sendOrQueue = (attempt: number) => {
    if (typeof window.gtag === "function") {
      window.gtag("config", GA_MEASUREMENT_ID, { page_path: path });
      return;
    }
    if (attempt < GTAG_RETRY_MAX) {
      window.setTimeout(() => sendOrQueue(attempt + 1), GTAG_RETRY_MS);
      return;
    }
    (window.dataLayer ??= []).push(["config", GA_MEASUREMENT_ID, { page_path: path }]);
    gaLog("page_view: gtag 없음 → dataLayer 큐에 config 폴백");
  };

  sendOrQueue(0);
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
