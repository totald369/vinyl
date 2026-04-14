"use client";

import type { StoreData } from "@/hooks/useStores";
import { sendGtagEvent } from "@/lib/gtag";
import { getShortShareUrl, getStoreMetadata, isValidShortCode } from "@/lib/shortLink";

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

/**
 * Web Share API when available; otherwise clipboard. Fires GA `share_store` on success.
 */
export async function shareStoreWithTracking(
  store: Pick<StoreData, "name" | "shortCode" | "roadAddress" | "address">
): Promise<"web_share" | "clipboard" | "aborted" | "invalid"> {
  if (!isValidShortCode(store.shortCode)) return "invalid";
  const { title, description } = getStoreMetadata(store);
  const url = getShortShareUrl(store);
  const code = store.shortCode!;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: description, url });
      sendGtagEvent("share_store", {
        store_name: store.name,
        short_code: code,
        share_method: "web_share"
      });
      return "web_share";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "aborted";
    }
  }

  try {
    await copyTextToClipboard(url);
    sendGtagEvent("share_store", {
      store_name: store.name,
      short_code: code,
      share_method: "clipboard"
    });
    return "clipboard";
  } catch {
    return "aborted";
  }
}
