"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import StoreShareFallback from "@/components/StoreShareFallback";
import type { StoreData } from "@/hooks/useStores";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";
import { isValidShortCode } from "@/lib/shortLink";
import type { StoreShareFallbackPayload } from "@/lib/storeShareClient";
import { getShareButtonHint, shareStoreWithTracking } from "@/lib/storeShareClient";

type Props = {
  store: StoreData;
  directionsHref: string;
  addressLine: string;
};

export default function StoreDetailPageActions({ store, directionsHref, addressLine }: Props) {
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareFallback, setShareFallback] = useState<StoreShareFallbackPayload | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const handleShare = useCallback(async () => {
    const result = await shareStoreWithTracking(store);
    if (result.status === "clipboard") {
      showToast("링크가 복사되었습니다");
      return;
    }
    if (result.status === "fallback_ui") {
      setShareFallback(result.payload);
      return;
    }
    if (result.status === "invalid") {
      showToast("공유 링크를 준비 중입니다. 잠시 후 다시 시도해 주세요");
    }
  }, [showToast, store]);

  const canShare = true;
  const shareButtonHint = getShareButtonHint();

  return (
    <>
      <div className="mt-6 flex w-full gap-1">
        {canShare ? (
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-[8px] border border-[#DDDDDD] bg-white px-4 text-[16px] font-bold leading-[1.5] text-[#171717] outline-none transition-colors active:bg-[rgba(23,23,23,0.04)] focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="공유하기"
            title={shareButtonHint}
          >
            공유하기
            <img src="/Img/Icon/share_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
          </button>
        ) : null}
        <a
          href={directionsHref}
          target="_blank"
          rel="noreferrer"
          className={`flex h-12 min-w-0 items-center justify-center rounded-[8px] bg-[#171717] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c] ${
            canShare ? "flex-1" : "w-full"
          }`}
        >
          {"\uCE74\uCE74\uC624\uB9F5 \uAE38\uCC3E\uAE30"}
        </a>
      </div>

      {SHOW_STORE_EDIT_REQUEST_BUTTON ? (
        <div className="mt-3 text-center">
          <Link
            href={`/edit-request?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}&storeAddress=${encodeURIComponent(addressLine)}`}
            className="text-[14px] font-semibold text-[#111111] underline-offset-2 hover:underline"
          >
            정보 수정 요청
          </Link>
        </div>
      ) : null}

      {toastMessage ? (
        <div
          className="pointer-events-none fixed bottom-[max(100px,calc(18dvh+env(safe-area-inset-bottom,0px)))] left-1/2 z-toast max-w-[min(90vw,320px)] -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-full bg-[#171717] px-4 py-3 text-center text-[14px] font-semibold leading-normal text-white shadow-elevation-3">
            {toastMessage}
          </div>
        </div>
      ) : null}

      {shareFallback && isValidShortCode(store.shortCode) ? (
        <StoreShareFallback
          open
          onClose={() => setShareFallback(null)}
          storeId={store.id}
          storeName={store.name}
          shortCode={store.shortCode}
          payload={shareFallback}
          onCopied={() => showToast("\uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4")}
        />
      ) : null}
    </>
  );
}
