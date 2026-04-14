"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreProductChips } from "@/components/StoreProductChips";
import { StoreData } from "@/hooks/useStores";
import { formatDatasetUpdateLabel } from "@/lib/datasetDate";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";
import type { LatLng } from "@/lib/types";
import { resolveKakaoDirectionsUrl } from "@/lib/kakaoDirectionsUrl";
import { isValidShortCode } from "@/lib/shortLink";
import { getShareButtonHint, shareStoreWithTracking } from "@/lib/storeShareClient";

type Props = {
  store: StoreData;
  onClose: () => void;
  /** When set, directions can use "my location" as start */
  userLocation?: LatLng | null;
  /** After Kakao Maps SDK is ready, WGS84 routes use user location precisely */
  kakaoMapsReady?: boolean;
};

export default function StoreDetailSheet({
  store,
  onClose,
  userLocation = null,
  kakaoMapsReady = true
}: Props) {
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleScroll = useCallback(() => {
    setScrolling(true);
    if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current);
    scrollHideTimerRef.current = setTimeout(() => {
      setScrolling(false);
      scrollHideTimerRef.current = null;
    }, 700);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current);
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

  const addressLine = store.roadAddress?.trim() || store.address?.trim() || "";

  const copyAddress = useCallback(async () => {
    if (!addressLine) return;
    const write = async () => {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(addressLine);
        return;
      }
      const ta = document.createElement("textarea");
      ta.value = addressLine;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    };
    try {
      await write();
      showToast("\uC8FC\uC18C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4");
    } catch {
      // clipboard denied or unavailable
    }
  }, [addressLine, showToast]);

  const handleShareStore = useCallback(async () => {
    const result = await shareStoreWithTracking(store);
    if (result === "clipboard") {
      showToast("\uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4");
      return;
    }
    if (result === "manual") {
      showToast("\uB9C1\uD06C\uB97C \uC9C1\uC811 \uBCF5\uC0AC\uD574\uC8FC\uC138\uC694");
    }
  }, [store, showToast]);

  const updateLabel = useMemo(
    () => formatDatasetUpdateLabel(store.dataReferenceDate),
    [store.dataReferenceDate]
  );
  const directionsHref = useMemo(() => {
    if (!kakaoMapsReady) {
      return resolveKakaoDirectionsUrl(store, null);
    }
    return resolveKakaoDirectionsUrl(store, userLocation);
  }, [store, userLocation, kakaoMapsReady]);

  const canShare = isValidShortCode(store.shortCode);
  const shareButtonHint = getShareButtonHint();
  const showMetaSepBeforeEdit =
    SHOW_STORE_EDIT_REQUEST_BUTTON && (typeof store.distance === "number" || Boolean(updateLabel));

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[25] flex flex-col gap-3">
      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto mx-auto shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        목록으로 가기
      </button>

      <section className="pointer-events-auto flex max-h-[min(85dvh,calc(100dvh-56px))] min-h-0 w-full flex-col overflow-hidden rounded-t-[16px] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.04),0px_-8px_24px_0px_rgba(23,23,23,0.12)]">
        <button
          type="button"
          onClick={onClose}
          className="flex w-full shrink-0 flex-col items-center pt-3 pb-4"
          aria-label="Close and return to list"
        >
          <span className="h-1 w-11 rounded-full bg-[rgba(17,17,17,0.15)]" />
        </button>

        <div
          onScroll={handleScroll}
          className={`scrollbar-map-list flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-4 pb-2 ${
            scrolling ? "is-scrolling" : ""
          }`}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {store.adminVerified ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <img
                      src="/Img/Icon/confirm_24.svg"
                      alt=""
                      width={24}
                      height={24}
                      className="size-6 shrink-0"
                    />
                    <p className="text-[16px] font-semibold leading-normal tracking-[0.1px] text-[#0130b6]">
                      {"\uD310\uB9E4\uC5EC\uBD80 \uD655\uC778\uC644\uB8CC"}
                    </p>
                  </div>
                  <h2 className="text-[20px] font-bold leading-normal tracking-[0.1px] text-[#171717]">
                    {store.name}
                  </h2>
                </div>
              ) : (
                <h2 className="text-[20px] font-bold leading-normal tracking-[0.1px] text-[#171717]">
                  {store.name}
                </h2>
              )}
            </div>
            {addressLine ? (
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="w-full rounded-lg py-1 text-left text-[16px] font-normal leading-[1.4] tracking-[0.1px] text-[#555555] outline-none transition-colors active:bg-[rgba(23,23,23,0.06)] focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Copy address"
              >
                {addressLine}
              </button>
            ) : null}
            <StoreProductChips store={store} />
            <div className="flex flex-wrap items-center gap-2">
              {typeof store.distance === "number" ? (
                <p className="text-[14px] font-normal leading-normal tracking-[0.1px] text-[#999999]">
                  {store.distance.toFixed(1)}km
                </p>
              ) : null}
              {typeof store.distance === "number" && updateLabel ? (
                <span className="h-3 w-px shrink-0 bg-[rgba(23,23,23,0.1)]" aria-hidden />
              ) : null}
              {updateLabel ? (
                <p className="text-[14px] font-normal leading-normal tracking-[0.1px] text-[#999999]">
                  {updateLabel}
                </p>
              ) : null}
              {showMetaSepBeforeEdit ? (
                <span className="h-3 w-px shrink-0 bg-[rgba(23,23,23,0.1)]" aria-hidden />
              ) : null}
              {SHOW_STORE_EDIT_REQUEST_BUTTON ? (
                <Link
                  href={`/edit-request?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}&storeAddress=${encodeURIComponent(addressLine)}`}
                  className="text-[14px] font-semibold leading-normal tracking-[0.1px] text-[#111111] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  정보 수정 요청
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex w-full gap-1 pb-2">
            {canShare ? (
              <button
                type="button"
                onClick={() => void handleShareStore()}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-[8px] border border-[#DDDDDD] bg-white px-4 text-[16px] font-bold leading-[1.5] text-[#171717] outline-none transition-colors active:bg-[rgba(23,23,23,0.04)] focus-visible:ring-2 focus-visible:ring-brand-500 md:hidden"
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
                canShare ? "flex-1 md:flex-none md:w-full" : "w-full"
              }`}
            >
              {"\uCE74\uCE74\uC624\uB9F5 \uAE38\uCC3E\uAE30"}
            </a>
          </div>
        </div>

        <div className="w-full shrink-0 bg-white pb-[env(safe-area-inset-bottom,0px)]">
          <div className="relative mx-auto h-[33px] w-[135px]">
            <span className="absolute bottom-2 left-1/2 h-[5px] w-[135px] -translate-x-1/2 rounded-[100px] bg-[#222222]" />
          </div>
        </div>
      </section>

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
    </div>
  );
}
