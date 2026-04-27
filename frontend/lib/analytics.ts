"use client";

import { sendGtagEvent } from "@/lib/gtag";

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

