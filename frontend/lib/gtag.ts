/** 빌드/런타임에 `NEXT_PUBLIC_GA_MEASUREMENT_ID`가 없을 때 쓰는 기본 측정 ID */
const GA_DEFAULT_ID = "G-80ZYJJ27G5";

/**
 * `NEXT_PUBLIC_*`는 빌드 시 클라이언트 번들에 인라인됩니다.
 * - 키가 없음(undefined): 경고 후 기본값 사용(배포 기본 동작 유지).
 * - 빈 문자열: 의도적 비활성화로 간주 → null, 스크립트 미삽입.
 * - 형식 오류(G-… 아님): null + 경고.
 */
export function getGaMeasurementId(): string | null {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID : undefined;

  if (raw === undefined) {
    /* 프로덕션 빌드(SSG)에서는 로그 스팸 방지 — 로컬 dev에서만 안내 */
    if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
      console.warn(
        `[GA] NEXT_PUBLIC_GA_MEASUREMENT_ID is undefined; using built-in default ${GA_DEFAULT_ID}.`
      );
    }
    return GA_DEFAULT_ID;
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    if (typeof console !== "undefined") {
      console.warn(
        "[GA] NEXT_PUBLIC_GA_MEASUREMENT_ID is empty; GA scripts will not load. Set a valid G- ID or remove the variable to use the default."
      );
    }
    return null;
  }

  if (!/^G-[A-Z0-9]+$/i.test(trimmed)) {
    if (typeof console !== "undefined") {
      console.warn("[GA] NEXT_PUBLIC_GA_MEASUREMENT_ID is invalid:", raw);
    }
    return null;
  }

  return trimmed;
}

/** 모듈 로드 시 한 번 결정. GoogleAnalyticsScripts / 클라이언트 gtag 호출이 동일 값을 씁니다. */
export const GA_MEASUREMENT_ID: string | null = getGaMeasurementId();

/**
 * `NEXT_PUBLIC_GA_ROUTE_TRACKER=0` 또는 `false` → 라우트 전환 page_view만 끔.
 * 최초 page_view는 GoogleAnalyticsScripts(gtag config)만으로 측정됨.
 */
export const GA_ROUTE_TRACKER_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_GA_ROUTE_TRACKER !== "0" &&
  process.env.NEXT_PUBLIC_GA_ROUTE_TRACKER !== "false";

/**
 * 프로덕션에서만 켜두세요. 수집 확인 후 `NEXT_PUBLIC_GA_DEBUG` 제거 권장.
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
 * 클라이언트 라우트 전환 시 page_view (최초는 GoogleAnalyticsScripts의 gtag('config')만).
 */
export function sendGtagPageView(path: string) {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) return;
  gaLog("page_view (route)", path);

  const id = GA_MEASUREMENT_ID;
  const sendOrQueue = (attempt: number) => {
    if (typeof window.gtag === "function") {
      window.gtag("config", id, { page_path: path });
      return;
    }
    if (attempt < GTAG_RETRY_MAX) {
      window.setTimeout(() => sendOrQueue(attempt + 1), GTAG_RETRY_MS);
      return;
    }
    (window.dataLayer ??= []).push(["config", id, { page_path: path }]);
    gaLog("page_view: gtag 없음 → dataLayer 큐에 config 폴백");
  };

  sendOrQueue(0);
}

/** GA4 맞춤 이벤트 (프로덕션에서만 전송) */
export function sendGtagEvent(
  eventName: GtagCustomEventName,
  params?: Record<string, string | number | boolean | undefined>
) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production" || !GA_MEASUREMENT_ID) {
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
