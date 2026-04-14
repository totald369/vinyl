"use client";

import type { StoreData } from "@/hooks/useStores";
import { sendGtagEvent } from "@/lib/gtag";
import { getShortShareUrl, getStoreMetadata, isValidShortCode } from "@/lib/shortLink";

type ShareMethod = "web_share" | "clipboard" | "manual";

type ShareResult = ShareMethod | "aborted" | "invalid";

type ShareDebugInfo = {
  hasNavigatorShare: boolean;
  hasNavigatorCanShare: boolean;
  hasClipboardWriteText: boolean;
};

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function getShareDebugInfo(): ShareDebugInfo {
  if (typeof navigator === "undefined") {
    return {
      hasNavigatorShare: false,
      hasNavigatorCanShare: false,
      hasClipboardWriteText: false,
    };
  }

  return {
    hasNavigatorShare: typeof navigator.share === "function",
    hasNavigatorCanShare: typeof navigator.canShare === "function",
    hasClipboardWriteText: typeof navigator.clipboard?.writeText === "function",
  };
}

function trackShare(storeName: string, shortCode: string, method: ShareMethod) {
  sendGtagEvent("share_store", {
    store_name: storeName,
    short_code: shortCode,
    share_method: method,
  });
}

/**
 * Web Share API when available; otherwise clipboard. Fires GA `share_store` on success.
 */
export async function shareStoreWithTracking(
  store: Pick<StoreData, "name" | "shortCode" | "roadAddress" | "address">
) : Promise<ShareResult> {
  if (!isValidShortCode(store.shortCode)) return "invalid";
  const { title, description } = getStoreMetadata(store);
  const shortUrl = getShortShareUrl(store);
  const code = store.shortCode!;
  const shareData = { title, text: description, url: shortUrl };
  const debug = getShareDebugInfo();

  console.log("[share_store] capability", debug);

  if (debug.hasNavigatorShare) {
    const canShareData = debug.hasNavigatorCanShare ? navigator.canShare(shareData) : true;
    console.log("[share_store] canShare(data)", canShareData);
    try {
      if (canShareData) {
        console.log("[share_store] branch", "web_share");
        await navigator.share(shareData);
        trackShare(store.name, code, "web_share");
        return "web_share";
      }
      console.log("[share_store] branch", "clipboard (canShare false)");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "aborted";
      console.log("[share_store] web_share failed -> fallback", e);
    }
  } else {
    console.log("[share_store] branch", "clipboard (share unsupported)");
  }

  try {
    await copyTextToClipboard(shortUrl);
    trackShare(store.name, code, "clipboard");
    console.log("[share_store] branch", "clipboard");
    return "clipboard";
  } catch (e) {
    console.log("[share_store] clipboard failed -> manual_fallback", e);
  }

  // Final fallback: always show a usable link to users on blocked clipboard environments.
  if (typeof window !== "undefined") {
    window.alert(`링크를 직접 복사해주세요.\n${shortUrl}`);
    trackShare(store.name, code, "manual");
    console.log("[share_store] branch", "manual_fallback");
    return "manual";
  }

  return "aborted";
}

export function getShareButtonHint(): string {
  const debug = getShareDebugInfo();
  if (debug.hasNavigatorShare) {
    const canShareText = debug.hasNavigatorCanShare ? "지원 브라우저에서 공유" : "공유";
    return `${canShareText} / 미지원 시 링크 복사`;
  }
  return "링크 복사";
}
