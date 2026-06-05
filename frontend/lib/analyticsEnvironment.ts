import { SITE_APEX_HOST, SITE_CANONICAL_HOST } from "@/lib/site";

/** 실제 GA4 수집 대상 프로덕션 호스트 */
export const PRODUCTION_ANALYTICS_HOSTS: ReadonlySet<string> = new Set([
  SITE_CANONICAL_HOST,
  SITE_APEX_HOST
]);

export function getAnalyticsHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

export function isProductionAnalyticsHost(hostname = getAnalyticsHostname()): boolean {
  return PRODUCTION_ANALYTICS_HOSTS.has(hostname);
}

/** localhost·루프백·Vercel preview·기타 비프로덕션 호스트 */
export function isLocalOrPreviewAnalyticsHost(hostname = getAnalyticsHostname()): boolean {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return true;
  }
  if (hostname.endsWith(".vercel.app")) return true;
  if (!isProductionAnalyticsHost(hostname)) return true;
  return false;
}

/**
 * GA4 이벤트·page_view 실제 전송 여부.
 * NODE_ENV=production 빌드라도 preview URL에서는 전송하지 않음.
 */
export function shouldSendGa4Events(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return false;
  return isProductionAnalyticsHost();
}

/** 개발·프리뷰에서 console.table 등 디버그 출력 */
export function shouldLogAnalyticsDebug(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return isLocalOrPreviewAnalyticsHost();
}
