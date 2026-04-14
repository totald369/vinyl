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

function canSharePayload(data: ShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return true;
  }
  try {
    return navigator.canShare(data);
  } catch {
    return false;
  }
}

/**
 * Web Share API when available; otherwise clipboard. Fires GA `share_store` on success.
 */
export async function shareStoreWithTracking(
  store: Pick<StoreData, "name" | "shortCode" | "roadAddress" | "address">
): Promise<ShareResult> {
  if (!isValidShortCode(store.shortCode)) return "invalid";
  const { title, description } = getStoreMetadata(store);
  const shortUrl = getShortShareUrl(store);
  const code = store.shortCode!;
  const debug = getShareDebugInfo();

  const candidates: ShareData[] = [
    { title, text: description, url: shortUrl },
    { title, url: shortUrl },
    { url: shortUrl },
  ];

  console.log("[share_store] capability", debug);

  if (debug.hasNavigatorShare) {
    for (const data of candidates) {
      if (!canSharePayload(data)) {
        console.log("[share_store] canShare skip", Object.keys(data).join(","));
        continue;
      }
      try {
        console.log("[share_store] branch try web_share", Object.keys(data).join(","));
        await navigator.share(data);
        trackShare(store.name, code, "web_share");
        console.log("[share_store] branch", "web_share");
        return "web_share";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          console.log("[share_store] branch", "aborted");
          return "aborted";
        }
        console.log("[share_store] web_share failed, next candidate", e);
      }
    }

    /* Last resort: some engines mis-report canShare — try URL-only once. */
    try {
      console.log("[share_store] branch try web_share url-only (ignore canShare)");
      await navigator.share({ url: shortUrl });
      trackShare(store.name, code, "web_share");
      console.log("[share_store] branch", "web_share");
      return "web_share";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        console.log("[share_store] branch", "aborted");
        return "aborted";
      }
      console.log("[share_store] web_share url-only failed -> clipboard", e);
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

  if (typeof window !== "undefined") {
    window.alert(`\uB9C1\uD06C\uB97C \uC9C1\uC811 \uBCF5\uC0AC\uD574\uC8FC\uC138\uC694.\n${shortUrl}`);
    trackShare(store.name, code, "manual");
    console.log("[share_store] branch", "manual_fallback");
    return "manual";
  }

  return "aborted";
}

export function getShareButtonHint(): string {
  const debug = getShareDebugInfo();
  if (debug.hasNavigatorShare) {
    const canShareText = debug.hasNavigatorCanShare
      ? "지원 브라우저에서 공유"
      : "공유";
    return `${canShareText} / 미지원 시 링크 복사`;
  }
  return "링크 복사";
}
