"use client";

import { useCallback } from "react";
import { sendGtagEvent } from "@/lib/gtag";
import type { StoreShareFallbackPayload } from "@/lib/storeShareClient";
import { copyShareText } from "@/lib/storeShareClient";

type Props = {
  open: boolean;
  onClose: () => void;
  storeName: string;
  shortCode: string;
  payload: StoreShareFallbackPayload;
  onCopied: () => void;
};

function trackShareMethod(storeName: string, shortCode: string, method: string) {
  sendGtagEvent("share_store", {
    store_name: storeName,
    short_code: shortCode,
    share_method: method
  });
}

export default function StoreShareFallback({
  open,
  onClose,
  storeName,
  shortCode,
  payload,
  onCopied
}: Props) {
  const trySystemShare = useCallback(async () => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ url: payload.shortUrl });
      trackShareMethod(storeName, shortCode, "web_share");
      onClose();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        onClose();
      }
    }
  }, [onClose, payload.shortUrl, shortCode, storeName]);

  const openKakaoTalk = useCallback(() => {
    const text = encodeURIComponent(payload.lineForChat);
    window.location.href = `kakaotalk://send?text=${text}`;
    trackShareMethod(storeName, shortCode, "kakaotalk_scheme");
  }, [payload.lineForChat, shortCode, storeName]);

  const openLine = useCallback(() => {
    const u = `https://line.me/R/msg/text/?${encodeURIComponent(payload.lineForChat)}`;
    window.open(u, "_blank", "noopener,noreferrer");
    trackShareMethod(storeName, shortCode, "line_web");
  }, [payload.lineForChat, shortCode, storeName]);

  const openTwitter = useCallback(() => {
    const q = new URLSearchParams();
    q.set("text", `${payload.title}\n${payload.shortUrl}`);
    window.open(`https://twitter.com/intent/tweet?${q.toString()}`, "_blank", "noopener,noreferrer");
    trackShareMethod(storeName, shortCode, "twitter_intent");
  }, [payload.shortUrl, payload.title, shortCode, storeName]);

  const openFacebook = useCallback(() => {
    const u = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(payload.shortUrl)}`;
    window.open(u, "_blank", "noopener,noreferrer");
    trackShareMethod(storeName, shortCode, "facebook_web");
  }, [payload.shortUrl, shortCode, storeName]);

  const handleCopy = useCallback(async () => {
    try {
      await copyShareText(payload.lineForChat);
      trackShareMethod(storeName, shortCode, "clipboard");
      onCopied();
      onClose();
    } catch {
      /* noop */
    }
  }, [onClose, onCopied, payload.lineForChat, shortCode, storeName]);

  if (!open) return null;

  const showSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-modal flex items-end justify-center bg-neutral-900/40 px-0 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-share-fallback-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-floating sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-[rgba(17,17,17,0.15)] sm:hidden" aria-hidden />
        <h3 id="store-share-fallback-title" className="text-[18px] font-bold text-[#171717]">
          {"\uACF5\uC720\uD558\uAE30"}
        </h3>
        <p className="mt-1 text-[14px] leading-snug text-[#555555]">
          {
            "\uC2DC\uC2A4\uD15C \uACF5\uC720\uB85C \uB2E4\uB978 \uC571\uC744 \uACE0\uB974\uAC70\uB098, \uC544\uB798\uC5D0\uC11C \uCE74\uCE74\uC624\uD1A1\u00B7\uB77C\uC778\u00B7SNS\uB85C \uC5F4 \uC218 \uC788\uC5B4\uC694."
          }
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {showSystemShare ? (
            <button
              type="button"
              className="flex h-12 w-full items-center justify-center rounded-[8px] bg-[#171717] text-[16px] font-bold text-[#d4fe1c] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              onClick={() => void trySystemShare()}
            >
              {"\uB2E4\uB978 \uC571\uC73C\uB85C \uACF5\uC720\u2026"}
            </button>
          ) : null}
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-[8px] border border-[#DDDDDD] bg-white text-[16px] font-bold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={openKakaoTalk}
          >
            {"\uCE74\uCE74\uC624\uD1A1"}
          </button>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-[8px] border border-[#DDDDDD] bg-white text-[16px] font-bold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={openLine}
          >
            {"\uB77C\uC778"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex h-12 items-center justify-center rounded-[8px] border border-[#DDDDDD] bg-white text-[15px] font-bold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              onClick={openTwitter}
            >
              {"X(\uD2B8\uC704\uD130)"}
            </button>
            <button
              type="button"
              className="flex h-12 items-center justify-center rounded-[8px] border border-[#DDDDDD] bg-white text-[15px] font-bold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              onClick={openFacebook}
            >
              {"\uD398\uC774\uC2A4\uBD81"}
            </button>
          </div>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-[8px] border border-[#DDDDDD] bg-white text-[16px] font-bold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={() => void handleCopy()}
          >
            {"\uB9C1\uD06C \uBCF5\uC0AC"}
          </button>
          <button
            type="button"
            className="mt-1 flex h-11 w-full items-center justify-center rounded-[8px] text-[15px] font-semibold text-[#666666] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={onClose}
          >
            {"\uB2EB\uAE30"}
          </button>
        </div>
      </div>
    </div>
  );
}
