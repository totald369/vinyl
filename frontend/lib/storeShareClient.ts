"use client";

import type { StoreData } from "@/hooks/useStores";
import { sendGtagEvent } from "@/lib/gtag";
import { getShortShareUrl, getStoreMetadata, isValidShortCode } from "@/lib/shortLink";

type ShareMethod = "web_share";

export type StoreShareFallbackPayload = {
  title: string;
  shortUrl: string;
  lineForChat: string;
};

export type StoreShareOutcome =
  | { status: "web_share" }
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

function trackShare(storeName: string, shortCode: string, method: ShareMethod) {
  sendGtagEvent("share_store", {
    store_name: storeName,
    short_code: shortCode,
    share_method: method
  });
}

/**
 * Prefer Web Share API (native share sheet on mobile).
 * If unavailable or all attempts fail, return `fallback_ui` and show SNS / Kakao / copy UI.
 * Does not use `canShare` (unreliable in several in-app browsers).
 */
export async function shareStoreWithTracking(
  store: Pick<StoreData, "name" | "shortCode" | "roadAddress" | "address">
): Promise<StoreShareOutcome> {
  if (!isValidShortCode(store.shortCode)) {
    return { status: "invalid" };
  }

  const { title, description } = getStoreMetadata(store);
  const shortUrl = getShortShareUrl(store);
  const code = store.shortCode!;
  const lineForChat = [title, description, shortUrl].filter(Boolean).join("\n");
  const payload: StoreShareFallbackPayload = { title, shortUrl, lineForChat };

  const candidates: ShareData[] = [
    { url: shortUrl },
    { title, url: shortUrl },
    { title, text: description, url: shortUrl }
  ];

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    for (const data of candidates) {
      try {
        await navigator.share(data);
        trackShare(store.name, code, "web_share");
        return { status: "web_share" };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return { status: "aborted" };
        }
      }
    }
  }

  return { status: "fallback_ui", payload };
}

export function getShareButtonHint(): string {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    return "\uC2DC\uC2A4\uD15C \uACF5\uC720\uC5D0\uC11C \uCE74\uCE74\uC624\uD1A1\u00B7\uBA54\uC2DC\uC9C0 \uB4F1\uC744 \uACE0\uB97C \uC218 \uC788\uC5B4\uC694. \uD544\uC694\uD558\uBA74 \uC571\uBCC4 \uACF5\uC720\uB3C4 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
  }
  return "\uCE74\uCE74\uC624\uD1A1\u00B7\uB77C\uC778\u00B7SNS\uB85C \uC5F4\uAC70\uB098 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD560 \uC218 \uC788\uC5B4\uC694.";
}
