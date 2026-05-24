"use client";

import { sendGtagEvent } from "@/lib/gtag";
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

function cleanParams(params: ShareAnalyticsParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ) as Record<string, string>;
}

/**
 * Share analytics single entry point.
 *
 * 테스트 방법:
 * - GA4: 실시간 보고서 > 이벤트에서 `share_store_success` 확인
 * - Clarity: 세션 상세 또는 필터에서 `share_store_success` 확인
 * - 브라우저 콘솔에서 `[share-analytics]` 디버그 로그 확인
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

function cleanRegionParams(params: RegionAnalyticsParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ) as Record<string, string>;
}

/**
 * 지역으로 보기 플로우 (GA4 + Clarity). sendGtagEvent와 동일하게 prod·GA ID 있을 때만 GA 전송.
 */
export function trackRegionEvent(
  eventName: RegionAnalyticsEventName,
  params: RegionAnalyticsParams
): void {
  if (typeof window === "undefined") return;
  const cleaned = cleanRegionParams(params);
  sendGtagEvent(eventName, cleaned);
  if (typeof window.clarity === "function") {
    window.clarity("event", eventName);
    for (const [key, value] of Object.entries(cleaned)) {
      window.clarity("set", key, String(value));
    }
  }
}

function cleanRegionShareParams(params: RegionShareAnalyticsParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ) as Record<string, string | number>;
}

export function trackRegionShareEvent(
  eventName: RegionShareAnalyticsEventName,
  params: RegionShareAnalyticsParams
): void {
  if (typeof window === "undefined") return;
  const cleaned = cleanRegionShareParams(params);
  sendGtagEvent(eventName, cleaned);
  if (typeof window.clarity === "function") {
    window.clarity("event", eventName);
    for (const [key, value] of Object.entries(cleaned)) {
      window.clarity("set", key, String(value));
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.debug("[region-share-analytics]", eventName, cleaned);
  }
}

export function trackShareEvent(eventName: ShareAnalyticsEventName, params: ShareAnalyticsParams): void {
  if (typeof window === "undefined") return;

  const cleaned = cleanParams(params);

  // GA4 (guarded in sendGtagEvent if gtag / measurement id is unavailable)
  sendGtagEvent(eventName, cleaned);

  // Microsoft Clarity (no-op when not loaded)
  if (typeof window.clarity === "function") {
    window.clarity("event", eventName);
    for (const [key, value] of Object.entries(cleaned)) {
      window.clarity("set", key, String(value));
    }
  }

  console.debug("[share-analytics]", eventName, cleaned);
}

const PURCHASE_FEEDBACK_STORE_NAME_MAX = 120;

/** GA4/Clarity에 넣지 않을 수 있는 문자열(전화·URL·이메일 등)을 걸러 짧은 라벨만 허용 */
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

/**
 * 구매 여부 피드백 (GA4 + Clarity). `sendGtagEvent`와 동일하게 프로덕션·GA ID 있을 때만 GA 전송.
 * Clarity는 스크립트가 로드된 경우에만 동작(루트 layout에서 프로덕션 로드).
 * 개발 환경에서는 `console.debug`로 페이로드만 확인(운영 콘솔 스팸 없음).
 */
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

  sendGtagEvent("purchase_feedback_submit", gtagPayload);

  if (typeof window.clarity === "function") {
    window.clarity("event", "purchase_feedback_submit");
    window.clarity("set", "purchase_feedback_type", params.feedbackType);
    window.clarity("set", "purchase_feedback_result", params.result);
    window.clarity("set", "purchase_feedback_store_id", params.storeId);
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[purchase-feedback-analytics]", "purchase_feedback_submit", gtagPayload);
  }
}

