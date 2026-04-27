"use client";

import type { StoreData } from "@/hooks/useStores";
import type {
  ShareAnalyticsEnvironment,
  ShareAnalyticsMethod
} from "@/lib/analytics";
import { trackShareEvent } from "@/lib/analytics";
import { getShortShareUrl, getStoreMetadata, isValidShortCode } from "@/lib/shortLink";
import { SITE_URL } from "@/lib/site";

export type ShareEnvironment = ShareAnalyticsEnvironment;
export type ShareMethod = ShareAnalyticsMethod;

export type StoreShareFallbackPayload = {
  title: string;
  description: string;
  shortUrl: string;
  imageUrl: string;
  lineForChat: string;
  environment: ShareEnvironment;
  kakaoOnly: boolean;
};

export type StoreShareOutcome =
  | { status: "web_share" }
  | { status: "clipboard" }
  | { status: "aborted" }
  | { status: "invalid" }
  | { status: "fallback_ui"; payload: StoreShareFallbackPayload };

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* writeText can throw (permissions, gesture); fall through */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) {
    throw new Error("execCommand copy failed");
  }
}

/** Share sheet copy action */
export async function copyShareText(text: string): Promise<void> {
  await copyTextToClipboard(text);
}

function getShareEnvironment(): ShareEnvironment {
  if (typeof navigator === "undefined") return "unknown";
  return isKakaoInAppBrowser() ? "kakao_inapp" : "browser";
}

type ShareTrackContext = {
  storeId: string;
  storeName: string;
  shortCode: string;
  shareUrl: string;
  environment: ShareEnvironment;
  shareMethod: ShareMethod;
};

function getCurrentPagePath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function baseShareParams(ctx: ShareTrackContext) {
  return {
    store_id: ctx.storeId,
    store_name: ctx.storeName,
    short_code: ctx.shortCode,
    share_url: ctx.shareUrl,
    share_method: ctx.shareMethod,
    environment: ctx.environment,
    page_path: getCurrentPagePath()
  };
}

export function trackShareAttempt(ctx: ShareTrackContext) {
  trackShareEvent("share_store_attempt", baseShareParams(ctx));
}

export function trackShareSuccess(ctx: ShareTrackContext) {
  trackShareEvent("share_store_success", baseShareParams(ctx));
}

export function trackShareCopy(ctx: ShareTrackContext) {
  trackShareEvent("share_store_copy", baseShareParams(ctx));
}

export function trackShareKakao(ctx: ShareTrackContext) {
  trackShareEvent("share_store_kakao", baseShareParams(ctx));
}

export function trackShareError(ctx: ShareTrackContext, errorMessage?: string) {
  trackShareEvent("share_store_error", {
    ...baseShareParams(ctx),
    error_message: errorMessage
  });
}

/**
 * Prefer Web Share API (native share sheet on mobile).
 * If unavailable or all attempts fail, return `fallback_ui` and show SNS / Kakao / copy UI.
 * Does not use `canShare` (unreliable in several in-app browsers).
 */
export async function shareStoreWithTracking(
  store: Pick<StoreData, "id" | "name" | "shortCode" | "roadAddress" | "address">
): Promise<StoreShareOutcome> {
  if (!isValidShortCode(store.shortCode)) {
    const environment = getShareEnvironment();
    trackShareError(
      {
        storeId: store.id,
        storeName: store.name,
        shortCode: "invalid",
        shareUrl: "",
        shareMethod: "clipboard",
        environment
      },
      "invalid shortCode"
    );
    return { status: "invalid" };
  }

  const { title, description } = getStoreMetadata(store);
  const shortUrl = getShortShareUrl(store);
  const imageUrl = `${SITE_URL}/opengraph-image.png`;
  const code = store.shortCode!;
  const lineForChat = [title, description, shortUrl].filter(Boolean).join("\n");
  const environment = getShareEnvironment();
  const baseCtx: ShareTrackContext = {
    storeId: store.id,
    storeName: store.name,
    shortCode: code,
    shareUrl: shortUrl,
    shareMethod: environment === "kakao_inapp" ? "clipboard" : "web_share",
    environment
  };
  const payload: StoreShareFallbackPayload = {
    title,
    description,
    shortUrl,
    imageUrl,
    lineForChat,
    environment,
    kakaoOnly: environment === "kakao_inapp"
  };

  trackShareAttempt(baseCtx);

  // KakaoTalk in-app: never open fallback bottom sheet.
  // We attempt clipboard copy, then return "clipboard" either way so UI shows a toast only.
  if (environment === "kakao_inapp") {
    const copyCtx: ShareTrackContext = { ...baseCtx, shareMethod: "clipboard" };
    try {
      await copyShareText(shortUrl);
      trackShareCopy(copyCtx);
    } catch (e) {
      // In some in-app contexts clipboard can be permission-blocked.
      // Keep UX consistent with "copy" behavior request and avoid bottom-sheet fallback.
      trackShareError(copyCtx, e instanceof Error ? e.message : String(e));
    }
    trackShareSuccess(copyCtx);
    return { status: "clipboard" };
  }

  const candidates: ShareData[] = [
    { url: shortUrl },
    { title, url: shortUrl },
    { title, text: description, url: shortUrl }
  ];

  const webShareCtx: ShareTrackContext = { ...baseCtx, shareMethod: "web_share" };
  if (isWebShareAvailable()) {
    for (const data of candidates) {
      try {
        await navigator.share(data);
        trackShareSuccess(webShareCtx);
        return { status: "web_share" };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return { status: "aborted" };
        }
        trackShareError(webShareCtx, e instanceof Error ? e.message : String(e));
      }
    }
  }

  return { status: "fallback_ui", payload };
}

export function getShareButtonHint(): string {
  if (isKakaoInAppBrowser()) {
    return "카카오톡 인앱에서는 전용 공유 버튼으로 안정적으로 공유할 수 있어요.";
  }
  if (isWebShareAvailable()) {
    return "\uC2DC\uC2A4\uD15C \uACF5\uC720\uC5D0\uC11C \uCE74\uCE74\uC624\uD1A1\u00B7\uBA54\uC2DC\uC9C0 \uB4F1\uC744 \uACE0\uB97C \uC218 \uC788\uC5B4\uC694. \uD544\uC694\uD558\uBA74 \uC571\uBCC4 \uACF5\uC720\uB3C4 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
  }
  return "\uCE74\uCE74\uC624\uD1A1\u00B7\uB77C\uC778\u00B7SNS\uB85C \uC5F4\uAC70\uB098 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD560 \uC218 \uC788\uC5B4\uC694.";
}

export function isKakaoInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  return /KAKAOTALK|KakaoTalk/i.test(ua);
}

export function isWebShareAvailable(): boolean {
  if (isKakaoInAppBrowser()) return false;
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

type KakaoShareSendDefaultPayload = {
  objectType: "feed";
  content: {
    title: string;
    description: string;
    imageUrl: string;
    link: {
      mobileWebUrl: string;
      webUrl: string;
    };
  };
  buttons: Array<{
    title: string;
    link: { mobileWebUrl: string; webUrl: string };
  }>;
};

type KakaoGlobal = {
  Share?: {
    sendDefault: (payload: KakaoShareSendDefaultPayload) => void;
  };
  isInitialized?: () => boolean;
};

/** Returns true if Kakao SDK share succeeded. */
export async function shareViaKakaoSdk(payload: StoreShareFallbackPayload): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const kakao = (window as Window & { Kakao?: KakaoGlobal }).Kakao;
  if (!kakao?.Share?.sendDefault) return false;
  if (typeof kakao.isInitialized === "function" && !kakao.isInitialized()) {
    return false;
  }
  try {
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: payload.title,
        description: payload.description,
        imageUrl: payload.imageUrl,
        link: {
          mobileWebUrl: payload.shortUrl,
          webUrl: payload.shortUrl
        }
      },
      buttons: [
        {
          title: "업체 보기",
          link: {
            mobileWebUrl: payload.shortUrl,
            webUrl: payload.shortUrl
          }
        }
      ]
    });
    return true;
  } catch {
    return false;
  }
}
