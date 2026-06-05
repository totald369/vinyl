import {
  isLocalOrPreviewAnalyticsHost,
  isProductionAnalyticsHost,
  shouldLogAnalyticsDebug
} from "@/lib/analyticsEnvironment";
import { SITE_CANONICAL_HOST } from "@/lib/site";

export const TRAFFIC_ATTRIBUTION_STORAGE_KEY = "tbm_traffic_attribution";
const TRAFFIC_ATTRIBUTION_SENT_KEY = "tbm_traffic_attribution_sent";

export type DeviceType = "mobile" | "tablet" | "desktop";

export type TrafficAttributionRecord = {
  detected_source: string;
  detected_medium: string;
  detected_campaign: string;
  detected_referrer: string;
  landing_path: string;
  landing_query: string;
  landing_href: string;
  has_utm: boolean;
  is_direct: boolean;
  device_type: DeviceType;
  traffic_debug_reason: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  gclid: string;
  fbclid: string;
  captured_at: string;
};

export type TrafficAttributionEventParams = {
  detected_source: string;
  detected_medium: string;
  detected_campaign?: string;
  detected_referrer?: string;
  landing_path: string;
  landing_query?: string;
  current_path?: string;
  has_utm: boolean;
  is_direct: boolean;
  device_type: DeviceType;
  traffic_debug_reason: string;
};

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function getDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/\bAndroid\b/i.test(ua) && !/Mobile/i.test(ua))) {
    return "tablet";
  }
  if (/Mobi|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === SITE_CANONICAL_HOST || h === "trashbagmap.com" || h.endsWith(".trashbagmap.com");
}

function readStoredAttribution(): TrafficAttributionRecord | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TRAFFIC_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TrafficAttributionRecord;
  } catch {
    return null;
  }
}

function writeStoredAttribution(record: TrafficAttributionRecord): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TRAFFIC_ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* quota / private mode */
  }
}

function parseQueryParams(search: string): URLSearchParams {
  const q = search.startsWith("?") ? search : `?${search}`;
  return new URLSearchParams(q);
}

function hasMeaningfulUtm(params: URLSearchParams): boolean {
  return Boolean(
    params.get("utm_source")?.trim() ||
      params.get("utm_medium")?.trim() ||
      params.get("utm_campaign")?.trim()
  );
}

function extractUtmFields(params: URLSearchParams) {
  return {
    utm_source: collapse(params.get("utm_source") ?? ""),
    utm_medium: collapse(params.get("utm_medium") ?? ""),
    utm_campaign: collapse(params.get("utm_campaign") ?? ""),
    utm_content: collapse(params.get("utm_content") ?? ""),
    utm_term: collapse(params.get("utm_term") ?? ""),
    gclid: collapse(params.get("gclid") ?? ""),
    fbclid: collapse(params.get("fbclid") ?? "")
  };
}

type ReferrerGuess = {
  source: string;
  medium: string;
  reason: TrafficAttributionRecord["traffic_debug_reason"];
};

function classifyReferrerHost(host: string): ReferrerGuess | null {
  const h = host.toLowerCase();
  if (!h) return null;

  if (/google\./i.test(h)) {
    return { source: "google", medium: "organic", reason: "referrer_google" };
  }
  if (/search\.naver\.com|m\.search\.naver\.com|naver\.com/i.test(h)) {
    const medium = /search\.naver|m\.search\.naver/i.test(h) ? "organic" : "referral";
    return { source: "naver", medium, reason: "referrer_naver" };
  }
  if (/daum\.net|daum\.co\.kr/i.test(h)) {
    return { source: "daum", medium: "organic", reason: "referrer_unknown" };
  }
  if (/bing\.com/i.test(h)) {
    return { source: "bing", medium: "organic", reason: "referrer_unknown" };
  }
  if (/chatgpt\.com|chat\.openai\.com/i.test(h)) {
    return { source: "chatgpt", medium: "referral", reason: "referrer_chatgpt" };
  }
  if (/instagram\.com/i.test(h)) {
    return { source: "instagram", medium: "social", reason: "referrer_social" };
  }
  if (/threads\.net/i.test(h)) {
    return { source: "threads", medium: "social", reason: "referrer_social" };
  }
  if (/facebook\.com|fb\.com|m\.facebook\.com/i.test(h)) {
    return { source: "facebook", medium: "social", reason: "referrer_social" };
  }
  if (/kakao\.com|kakaocorp\.com|daum\.net/i.test(h)) {
    return { source: "kakao", medium: "share", reason: "referrer_social" };
  }
  if (/t\.co|twitter\.com|x\.com/i.test(h)) {
    return { source: "twitter", medium: "social", reason: "referrer_social" };
  }
  if (/youtube\.com|youtu\.be/i.test(h)) {
    return { source: "youtube", medium: "social", reason: "referrer_social" };
  }

  const base = h.replace(/^www\./, "").split(".")[0] || h;
  return { source: base, medium: "referral", reason: "referrer_unknown" };
}

function detectFromUserAgent(): ReferrerGuess | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent ?? "";
  if (/KAKAOTALK|KakaoTalk/i.test(ua)) {
    return { source: "kakao", medium: "share", reason: "referrer_social" };
  }
  if (/NAVER|Naver/i.test(ua) && /inapp|NAVER/i.test(ua)) {
    return { source: "naver", medium: "referral", reason: "referrer_naver" };
  }
  return null;
}

function buildAttributionFromContext(): TrafficAttributionRecord {
  const href = typeof window !== "undefined" ? window.location.href : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const referrerRaw = typeof document !== "undefined" ? document.referrer : "";
  const params = parseQueryParams(search);
  const utm = extractUtmFields(params);
  const device_type = getDeviceType();

  if (isLocalOrPreviewAnalyticsHost()) {
    return {
      detected_source: "debug",
      detected_medium: "preview",
      detected_campaign: "",
      detected_referrer: referrerRaw.slice(0, 500),
      landing_path: pathname,
      landing_query: search,
      landing_href: href.slice(0, 2000),
      has_utm: hasMeaningfulUtm(params),
      is_direct: !referrerRaw && !hasMeaningfulUtm(params),
      device_type,
      traffic_debug_reason: "preview_or_localhost",
      ...utm,
      captured_at: new Date().toISOString()
    };
  }

  if (hasMeaningfulUtm(params)) {
    return {
      detected_source: utm.utm_source || "utm",
      detected_medium: utm.utm_medium || "unknown",
      detected_campaign: utm.utm_campaign,
      detected_referrer: referrerRaw.slice(0, 500),
      landing_path: pathname,
      landing_query: search,
      landing_href: href.slice(0, 2000),
      has_utm: true,
      is_direct: false,
      device_type,
      traffic_debug_reason: "utm_detected",
      ...utm,
      captured_at: new Date().toISOString()
    };
  }

  if (referrerRaw) {
    try {
      const refUrl = new URL(referrerRaw);
      if (isInternalHost(refUrl.hostname)) {
        return {
          detected_source: "direct",
          detected_medium: "none",
          detected_campaign: "",
          detected_referrer: referrerRaw.slice(0, 500),
          landing_path: pathname,
          landing_query: search,
          landing_href: href.slice(0, 2000),
          has_utm: false,
          is_direct: true,
          device_type,
          traffic_debug_reason: "internal_referrer_ignored",
          ...utm,
          captured_at: new Date().toISOString()
        };
      }
      const guess = classifyReferrerHost(refUrl.hostname);
      if (guess) {
        return {
          detected_source: guess.source,
          detected_medium: guess.medium,
          detected_campaign: "",
          detected_referrer: referrerRaw.slice(0, 500),
          landing_path: pathname,
          landing_query: search,
          landing_href: href.slice(0, 2000),
          has_utm: false,
          is_direct: false,
          device_type,
          traffic_debug_reason: guess.reason,
          ...utm,
          captured_at: new Date().toISOString()
        };
      }
    } catch {
      /* invalid referrer URL */
    }
  }

  const uaGuess = detectFromUserAgent();
  if (uaGuess) {
    return {
      detected_source: uaGuess.source,
      detected_medium: uaGuess.medium,
      detected_campaign: "",
      detected_referrer: referrerRaw.slice(0, 500),
      landing_path: pathname,
      landing_query: search,
      landing_href: href.slice(0, 2000),
      has_utm: false,
      is_direct: false,
      device_type,
      traffic_debug_reason: uaGuess.reason,
      ...utm,
      captured_at: new Date().toISOString()
    };
  }

  return {
    detected_source: "direct",
    detected_medium: "none",
    detected_campaign: "",
    detected_referrer: referrerRaw.slice(0, 500),
    landing_path: pathname,
    landing_query: search,
    landing_href: href.slice(0, 2000),
    has_utm: false,
    is_direct: !referrerRaw,
    device_type,
    traffic_debug_reason: "no_referrer_direct",
    ...utm,
    captured_at: new Date().toISOString()
  };
}

function shouldReplaceAttribution(
  existing: TrafficAttributionRecord | null,
  incoming: TrafficAttributionRecord
): boolean {
  if (!existing) return true;
  if (incoming.has_utm && incoming.traffic_debug_reason === "utm_detected") {
    const changed =
      incoming.utm_source !== existing.utm_source ||
      incoming.utm_medium !== existing.utm_medium ||
      incoming.utm_campaign !== existing.utm_campaign;
    return changed;
  }
  return false;
}

/**
 * 최초 랜딩 attribution을 sessionStorage에 저장한다.
 * UTM 캠페인이 바뀌면 갱신(옵션).
 */
export function captureTrafficAttribution(): TrafficAttributionRecord {
  const incoming = buildAttributionFromContext();
  const existing = readStoredAttribution();

  if (shouldReplaceAttribution(existing, incoming)) {
    writeStoredAttribution(incoming);
    if (shouldLogAnalyticsDebug()) {
      console.table([incoming]);
    }
    return incoming;
  }

  if (shouldLogAnalyticsDebug() && existing) {
    console.table([{ ...existing, _note: "kept first landing" }]);
  }
  return existing ?? incoming;
}

export function getTrafficAttribution(): TrafficAttributionRecord | null {
  return readStoredAttribution();
}

export function getCurrentPathForAnalytics(): string {
  if (typeof window === "undefined") return "/";
  const { pathname, search } = window.location;
  return search ? `${pathname}${search}` : pathname;
}

/** 주요 GA4 이벤트에 공통으로 붙이는 축약 파라미터 */
export function getAttributionEventParams(): Record<string, string | boolean> {
  const record = readStoredAttribution();
  const current_path = getCurrentPathForAnalytics();
  if (!record) {
    return {
      detected_source: "unknown",
      detected_medium: "unknown",
      landing_path: current_path.split("?")[0] ?? "/",
      device_type: getDeviceType(),
      current_path
    };
  }
  return {
    detected_source: record.detected_source,
    detected_medium: record.detected_medium,
    landing_path: record.landing_path,
    device_type: record.device_type,
    current_path,
    ...(record.detected_campaign ? { detected_campaign: record.detected_campaign } : {})
  };
}

export function toTrafficAttributionEventPayload(
  record: TrafficAttributionRecord
): TrafficAttributionEventParams {
  return {
    detected_source: record.detected_source,
    detected_medium: record.detected_medium,
    detected_campaign: record.detected_campaign || undefined,
    detected_referrer: record.detected_referrer || undefined,
    landing_path: record.landing_path,
    landing_query: record.landing_query || undefined,
    current_path: getCurrentPathForAnalytics(),
    has_utm: record.has_utm,
    is_direct: record.is_direct,
    device_type: record.device_type,
    traffic_debug_reason: record.traffic_debug_reason
  };
}

export function markTrafficAttributionEventSent(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem(TRAFFIC_ATTRIBUTION_SENT_KEY) === "1") return false;
  sessionStorage.setItem(TRAFFIC_ATTRIBUTION_SENT_KEY, "1");
  return true;
}

export function isTrafficAttributionEventSent(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  return sessionStorage.getItem(TRAFFIC_ATTRIBUTION_SENT_KEY) === "1";
}

/** QA·디버그: 프로덕션 호스트 여부 */
export function getAnalyticsEnvironmentLabel(): string {
  if (isProductionAnalyticsHost()) return "production";
  if (isLocalOrPreviewAnalyticsHost()) return "preview_or_local";
  return "unknown";
}
