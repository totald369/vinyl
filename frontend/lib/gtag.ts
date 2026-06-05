/** 빌드/런타임에 `NEXT_PUBLIC_GA_MEASUREMENT_ID`가 없을 때 쓰는 기본 측정 ID */
const GA_DEFAULT_ID = "G-ZLEDFYW94N";

import { shouldLogAnalyticsDebug, shouldSendGa4Events } from "@/lib/analyticsEnvironment";
import { getAttributionEventParams } from "@/lib/trafficAttribution";

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
  | "traffic_attribution_detected"
  | "store_detail_open"
  | "copy_address_click"
  | "share_store_click"
  | "kakao_map_click"
  | "call_click"
  | "purchase_success_click"
  | "purchase_fail_click"
  | "report_store_click"
  | "click_my_location"
  | "click_report"
  | "click_marker"
  | "filter_select"
  | "open_region_view"
  | "select_region"
  | "select_store_category"
  | "click_region_store"
  | "share_store"
  | "share_store_attempt"
  | "share_store_success"
  | "share_store_copy"
  | "share_store_kakao"
  | "share_store_error"
  | "share_region_open"
  | "share_region_kakao"
  | "copy_region_link"
  | "purchase_feedback_submit";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function gaLog(...args: unknown[]) {
  if (GA_DEBUG || shouldLogAnalyticsDebug()) {
    console.log("[GA]", ...args);
  }
}

const GTAG_RETRY_MS = 50;
const GTAG_RETRY_MAX = 20;

function canSendToGa4(): boolean {
  return shouldSendGa4Events() && Boolean(GA_MEASUREMENT_ID);
}

function mergeEventParams(
  params?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> | undefined {
  const attribution = getAttributionEventParams();
  const merged: Record<string, string | number | boolean> = { ...attribution };
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        merged[key] = value;
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * App Router SPA: config는 send_page_view:false, 모든 화면은 event page_view로 전송.
 */
export function sendGtagPageView(path: string) {
  if (typeof window === "undefined" || !canSendToGa4()) {
    if (shouldLogAnalyticsDebug()) {
      gaLog("page_view (skipped)", path);
    }
    return;
  }

  gaLog("page_view", path);
  const page_location =
    typeof window !== "undefined" ? `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}` : path;

  const payload = mergeEventParams({
    page_path: path,
    page_location
  });

  const sendOrQueue = (attempt: number) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", payload);
      return;
    }
    if (attempt < GTAG_RETRY_MAX) {
      window.setTimeout(() => sendOrQueue(attempt + 1), GTAG_RETRY_MS);
      return;
    }
    (window.dataLayer ??= []).push(["event", "page_view", payload]);
    gaLog("page_view: gtag 없음 → dataLayer 큐");
  };

  sendOrQueue(0);
}

/** GA4 맞춤 이벤트 — www.trashbagmap.com 프로덕션 호스트에서만 전송 */
export function sendGtagEvent(
  eventName: GtagCustomEventName | string,
  params?: Record<string, string | number | boolean | undefined>
) {
  const merged = mergeEventParams(params);

  if (!canSendToGa4()) {
    if (shouldLogAnalyticsDebug()) {
      console.debug("[GA event debug]", eventName, merged);
    }
    return;
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, merged);
    return;
  }

  (window.dataLayer ??= []).push(["event", eventName, merged]);
}
