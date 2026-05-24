"use client";

import { useCallback } from "react";
import type { RegionShareAnalyticsParams } from "@/lib/analytics";
import { trackRegionShareEvent } from "@/lib/analytics";
import type { RegionShareCopy } from "@/lib/regionShare";
import { DEFAULT_OG_IMAGE_PATH } from "@/lib/seoBrand";
import { SITE_URL } from "@/lib/site";
import type { StoreShareFallbackPayload } from "@/lib/storeShareClient";
import {
  copyShareText,
  isKakaoInAppBrowser,
  isWebShareAvailable,
  shareViaKakaoSdk
} from "@/lib/storeShareClient";

type Props = {
  open: boolean;
  onClose: () => void;
  shareCopy: RegionShareCopy;
  shareUrl: string;
  analytics: RegionShareAnalyticsParams;
  onCopied: () => void;
};

export default function RegionShareSheet({
  open,
  onClose,
  shareCopy,
  shareUrl,
  analytics,
  onCopied
}: Props) {
  const kakaoPayload: StoreShareFallbackPayload = {
    title: shareCopy.title,
    description: shareCopy.description,
    shortUrl: shareUrl,
    imageUrl: `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`,
    lineForChat: shareCopy.clipboardText,
    environment: isKakaoInAppBrowser() ? "kakao_inapp" : "browser",
    kakaoOnly: false
  };

  const handleKakaoShare = useCallback(() => {
    void (async () => {
      trackRegionShareEvent("share_region_kakao", analytics);
      const shared = await shareViaKakaoSdk(kakaoPayload);
      if (shared) {
        onClose();
        return;
      }
      if (isWebShareAvailable()) {
        try {
          await navigator.share({
            title: shareCopy.title,
            text: shareCopy.description,
            url: shareUrl
          });
          onClose();
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      try {
        await copyShareText(shareCopy.clipboardText);
        trackRegionShareEvent("copy_region_link", analytics);
        onCopied();
        onClose();
      } catch {
        /* clipboard blocked — sheet stays open */
      }
    })();
  }, [analytics, kakaoPayload, onClose, onCopied, shareCopy, shareUrl]);

  const handleCopyLink = useCallback(() => {
    void (async () => {
      try {
        await copyShareText(shareCopy.clipboardText);
        trackRegionShareEvent("copy_region_link", analytics);
        onCopied();
        onClose();
      } catch {
        /* clipboard blocked */
      }
    })();
  }, [analytics, onClose, onCopied, shareCopy.clipboardText]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-end justify-center bg-neutral-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="region-share-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[0px_4px_16px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-[rgba(17,17,17,0.15)]" aria-hidden />
        <h2
          id="region-share-sheet-title"
          className="text-[18px] font-bold leading-[1.5] tracking-[0.1px] text-[#171717]"
        >
          이 지역 판매처 공유하기
        </h2>
        <p className="mt-1 text-[14px] font-normal leading-[1.5] text-[#666666]">
          {shareCopy.sheetDescription}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-[8px] bg-[#171717] text-[16px] font-bold leading-normal text-[#d4fe1c] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={handleKakaoShare}
          >
            카카오톡으로 공유
          </button>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-[8px] border border-[#dddddd] bg-white text-[16px] font-bold leading-normal text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={() => void handleCopyLink()}
          >
            링크 복사
          </button>
          <button
            type="button"
            className="mt-1 flex h-11 w-full items-center justify-center rounded-[8px] text-[15px] font-semibold text-[#666666] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
