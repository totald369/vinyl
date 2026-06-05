"use client";

import { sendGtagEvent, type GtagCustomEventName } from "@/lib/gtag";
import type { PurchaseFeedbackType } from "@/lib/purchaseFeedbackStorage";

export type ShareAnalyticsEventName =
  | "share_store_attempt"
  | "share_store_success"
  | "share_store_copy"
  | "share_store_kakao"
  | "share_store_error";

export type ShareAnalyticsMethod = "web_share" | "kakao_share" | "clipboard";
export type ShareAnalyticsEnvironment = "browser" | "kakao_inapp" | "unknown";

export type ShareAnalyticsParams = {
  store_id: string;
  store_name: string;
  short_code: string;
  share_url: string;
  share_method: ShareAnalyticsMethod;
  environment: ShareAnalyticsEnvironment;
  page_path: string;
  error_message?: string;
};

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

function cleanParams<T extends Record<string, unknown>>(params: T) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ) as Record<string, string | number | boolean>;
}

/**
 * GA4·Clarity 공통 이벤트 진입점. session attribution 파라미터가 자동 병합된다.
 *
 * GA4 Admin > 맞춤 정의 > 맞춤 측정기준(이벤트 범위) 등록 권장:
 * - detected_source, detected_medium, landing_path, device_type, traffic_debug_reason, has_utm
 *
 * DebugView 확인 이벤트: traffic_attribution_detected, share_store_success, copy_address_click,
 * kakao_map_click, purchase_success_click, purchase_fail_click
 */
export function trackEvent(
  eventName: GtagCustomEventName | string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === "undefined") return;
  sendGtagEvent(eventName, params);
}

function trackClarity(eventName: string, params: Record<string, string | number | boolean>) {
  if (typeof window.clarity !== "function") return;
  window.clarity("event", eventName);
  for (const [key, value] of Object.entries(params)) {
    window.clarity("set", key, String(value));
  }
}

/**
 * Share analytics single entry point.
 */
export type RegionAnalyticsEventName =
  | "open_region_view"
  | "select_region"
  | "select_store_category"
  | "click_region_store";

export type RegionShareAnalyticsEventName =
  | "share_region_open"
  | "share_region_kakao"
  | "copy_region_link";

export type RegionShareAnalyticsParams = {
  region: string;
  city?: string;
  district?: string;
  product_type: string;
  result_count: number;
  share_location: "header";
};

export type RegionAnalyticsParams = {
  province?: string;
  city?: string;
  district?: string;
  category?: string;
  region_path?: string;
  store_id?: string;
};

export function trackRegionEvent(
  eventName: RegionAnalyticsEventName,
  params: RegionAnalyticsParams
): void {
  if (typeof window === "undefined") return;
  const cleaned = cleanParams(params);
  trackEvent(eventName, cleaned);
  trackClarity(eventName, cleaned);
}

export function trackRegionShareEvent(
  eventName: RegionShareAnalyticsEventName,
  params: RegionShareAnalyticsParams
): void {
  if (typeof window === "undefined") return;
  const cleaned = cleanParams(params);
  trackEvent(eventName, cleaned);
  trackClarity(eventName, cleaned);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[region-share-analytics]", eventName, cleaned);
  }
}

export function trackShareEvent(eventName: ShareAnalyticsEventName, params: ShareAnalyticsParams): void {
  if (typeof window === "undefined") return;

  const cleaned = cleanParams(params);
  trackEvent(eventName, cleaned);
  if (eventName === "share_store_success") {
    trackEvent("share_store_click", cleaned);
  }
  trackClarity(eventName, cleaned);

  if (process.env.NODE_ENV !== "production") {
    console.debug("[share-analytics]", eventName, cleaned);
  }
}

const PURCHASE_FEEDBACK_STORE_NAME_MAX = 120;

function sanitizePurchaseFeedbackErrorMessage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!t) return undefined;
  if (/https?:\/\//i.test(t)) return "error_redacted";
  if (/@/.test(t)) return "error_redacted";
  if (/\d{9,}/.test(t)) return "error_redacted";
  return t;
}

function truncateStoreNameForAnalytics(name: string): string {
  const s = name.trim();
  if (s.length <= PURCHASE_FEEDBACK_STORE_NAME_MAX) return s;
  return s.slice(0, PURCHASE_FEEDBACK_STORE_NAME_MAX);
}

export type TrackPurchaseFeedbackParams = {
  storeId: string;
  storeName: string;
  feedbackType: PurchaseFeedbackType;
  feedbackLabel: "샀어요" | "못 샀어요";
  result: "success" | "duplicate" | "error";
  isDuplicateAttempt: boolean;
  hasPhoneNumber: boolean;
  hasSpecialBag: boolean;
  hasTrashBag: boolean;
  hasLargeWasteSticker: boolean;
  errorMessage?: string;
};

export function trackPurchaseFeedbackEvent(params: TrackPurchaseFeedbackParams): void {
  if (typeof window === "undefined") return;

  const submittedAt = new Date().toISOString();
  const gtagPayload: Record<string, string | number | boolean> = {
    store_id: params.storeId,
    store_name: truncateStoreNameForAnalytics(params.storeName),
    feedback_type: params.feedbackType,
    feedback_label: params.feedbackLabel,
    has_phone_number: params.hasPhoneNumber,
    has_special_bag: params.hasSpecialBag,
    has_trash_bag: params.hasTrashBag,
    has_large_waste_sticker: params.hasLargeWasteSticker,
    source: "store_detail",
    submitted_at: submittedAt,
    is_duplicate_attempt: params.isDuplicateAttempt,
    result: params.result
  };

  const safeErr = sanitizePurchaseFeedbackErrorMessage(params.errorMessage);
  if (params.result === "error" && safeErr) {
    gtagPayload.error_message = safeErr;
  }

  trackEvent("purchase_feedback_submit", gtagPayload);

  if (params.feedbackType === "success" && params.result === "success") {
    trackEvent("purchase_success_click", gtagPayload);
  } else if (params.feedbackType === "failure" || params.result === "error") {
    trackEvent("purchase_fail_click", gtagPayload);
  }

  trackClarity("purchase_feedback_submit", gtagPayload);

  if (process.env.NODE_ENV !== "production") {
    console.debug("[purchase-feedback-analytics]", "purchase_feedback_submit", gtagPayload);
  }
}
