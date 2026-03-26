"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreProductChips } from "@/components/StoreProductChips";
import { StoreData } from "@/hooks/useStores";
import { formatDatasetUpdateLabel } from "@/lib/datasetDate";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";
import type { LatLng } from "@/lib/types";
import { resolveKakaoDirectionsUrl } from "@/lib/kakaoDirectionsUrl";

type Props = {
  store: StoreData;
  onClose: () => void;
  /** 위치 권한이 허용된 경우에만 전달 → 길찾기 시 출발지가 「내 위치」로 채워짐 */
  userLocation?: LatLng | null;
  /** 카카오 SDK 로드 완료 후 true → Wcongnamul 좌표 변환 가능 */
  kakaoMapsReady?: boolean;
};

export default function StoreDetailSheet({
  store,
  onClose,
  userLocation = null,
  kakaoMapsReady = true
}: Props) {
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrolling, setScrolling] = useState(false);

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
    };
  }, []);

  const updateLabel = useMemo(
    () => formatDatasetUpdateLabel(store.dataReferenceDate),
    [store.dataReferenceDate]
  );
  const addressLine = store.roadAddress?.trim() || store.address?.trim() || "";
  const directionsHref = useMemo(() => {
    if (!kakaoMapsReady) {
      return resolveKakaoDirectionsUrl(store, null);
    }
    return resolveKakaoDirectionsUrl(store, userLocation);
  }, [store, userLocation, kakaoMapsReady]);

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[25] flex max-h-[min(92vh,calc(100%-48px))] flex-col-reverse items-center gap-4">
      <section className="pointer-events-auto flex min-h-0 w-full max-h-full flex-1 flex-col overflow-hidden rounded-t-[16px] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.04),0px_-8px_24px_0px_rgba(23,23,23,0.12)]">
        <button
          type="button"
          onClick={onClose}
          className="flex w-full shrink-0 flex-col items-center pt-3 pb-4"
          aria-label="목록으로 돌아가기"
        >
          <span className="h-1 w-11 rounded-full bg-[rgba(17,17,17,0.15)]" />
        </button>

        <div
          onScroll={handleScroll}
          className={`scrollbar-map-list flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 ${
            scrolling ? "is-scrolling" : ""
          }`}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {store.adminVerified ? (
                <div className="flex items-center gap-2">
                  <img src="/Img/Icon/confirm_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
                  <p className="text-[16px] font-semibold leading-normal tracking-[0.1px] text-[#0130b6]">
                    판매여부 확인완료
                  </p>
                </div>
              ) : null}
              <h2 className="text-[20px] font-bold leading-normal tracking-[0.1px] text-[#171717]">{store.name}</h2>
            </div>
            {addressLine ? (
              <p className="text-[16px] font-normal leading-[1.4] tracking-[0.1px] text-[#555555]">
                {addressLine}
              </p>
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
            </div>
          </div>

          <div className="flex gap-1 pb-2">
            {SHOW_STORE_EDIT_REQUEST_BUTTON ? (
              <Link
                href={`/edit-request?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}&storeAddress=${encodeURIComponent(addressLine)}`}
                className="flex h-12 min-w-[60px] flex-1 items-center justify-center rounded-[8px] border border-[#DDDDDD] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] text-[#171717]"
              >
                정보 수정 요청
              </Link>
            ) : null}
            <a
              href={directionsHref}
              target="_blank"
              rel="noreferrer"
              className={`flex h-12 min-w-[60px] items-center justify-center rounded-[8px] bg-[#171717] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c] ${
                SHOW_STORE_EDIT_REQUEST_BUTTON ? "flex-1" : "w-full"
              }`}
            >
              카카오맵으로 길찾기
            </a>
          </div>
        </div>

        <div className="h-[33px] w-full shrink-0 bg-white">
          <div className="relative mx-auto h-full w-[135px]">
            <span className="absolute bottom-2 left-1/2 h-[5px] w-[135px] -translate-x-1/2 rounded-[100px] bg-[#222222]" />
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        목록으로 가기
      </button>
    </div>
  );
}
