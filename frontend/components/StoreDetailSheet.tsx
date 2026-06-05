"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PurchaseFeedbackCard } from "@/components/PurchaseFeedbackCard";
import StoreShareFallback from "@/components/StoreShareFallback";
import { StoreProductChips } from "@/components/StoreProductChips";
import { StoreData } from "@/hooks/useStores";
import { formatDatasetUpdateLabel } from "@/lib/datasetDate";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";
import type { LatLng } from "@/lib/types";
import { normalizeProvinceAbbrevForDisplay } from "@/lib/koreaProvinceAliases";
import { resolveKakaoDirectionsUrl } from "@/lib/kakaoDirectionsUrl";
import { isValidShortCode } from "@/lib/shortLink";
import type { StoreShareFallbackPayload } from "@/lib/storeShareClient";
import {
  getCachedPurchaseFeedbackStats,
  getPurchaseFeedbackStats,
  primePurchaseFeedbackStats,
  submitPurchaseFeedback
} from "@/lib/purchaseFeedbackClient";
import { getOrCreateDeviceKey } from "@/lib/purchaseFeedbackDeviceKey";
import {
  hasSubmittedPurchaseFeedback,
  markPurchaseFeedbackSubmitted,
  type PurchaseFeedbackType
} from "@/lib/purchaseFeedbackStorage";
import { trackEvent, trackPurchaseFeedbackEvent } from "@/lib/analytics";
import { getShareButtonHint, shareStoreWithTracking } from "@/lib/storeShareClient";

type Props = {
  store: StoreData;
  onClose: () => void;
  /** When set, directions can use "my location" as start */
  userLocation?: LatLng | null;
  /** After Kakao Maps SDK is ready, WGS84 routes use user location precisely */
  kakaoMapsReady?: boolean;
  /** True while lazy `/api/stores?id=` is filling list-only row (shows layout placeholders). */
  isAugmentingDetail?: boolean;
};

/**
 * 변경 전: 상위(홈) state 변경 시 시트 본문까지 매번 리커밋.
 * 변경 후: React.memo로 id·거리·보강 상태 등 시각 동등 시 reconcile 생략.
 * 측정: React Profiler(Fire)에서 시트 subtree render count.
 */
function StoreDetailSheetInner({
  store,
  onClose,
  userLocation = null,
  kakaoMapsReady = true,
  isAugmentingDetail = false
}: Props) {
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "default" | "purchase" } | null>(null);
  const [purchaseFb, setPurchaseFb] = useState<{
    success: number;
    failure: number;
    loading: boolean;
    submitted: boolean;
  }>({ success: 0, failure: 0, loading: true, submitted: false });
  /** 연타·더블탭 시 API 두 번 호출 방지 (setState보다 먼저 동기적으로 막음) */
  const purchaseFeedbackSubmitLockRef = useRef(false);
  const [purchaseFeedbackSubmitting, setPurchaseFeedbackSubmitting] = useState(false);
  const [shareFallback, setShareFallback] = useState<StoreShareFallbackPayload | null>(null);

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

  useEffect(() => {
    trackEvent("store_detail_open", { store_id: store.id });
  }, [store.id]);

  const showToast = useCallback((message: string, variant: "default" | "purchase" = "default") => {
    setToast({ message, variant });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, variant === "purchase" ? 2600 : 2200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    purchaseFeedbackSubmitLockRef.current = false;
    setPurchaseFeedbackSubmitting(false);

    /**
     * 변경 전: 시트가 열릴 때마다 loading=true 로 두고 매번 fetch → 동일 매장 재오픈도 RTT 만큼 지연.
     * 변경 후: 메모리 캐시(30초 TTL) 히트 시 loading=false 로 즉시 본문 렌더,
     *         백그라운드 SWR 갱신은 별도 fetch 로 진행.
     */
    const cached = getCachedPurchaseFeedbackStats(store.id);
    if (cached) {
      setPurchaseFb({
        success: cached.successCount,
        failure: cached.failureCount,
        loading: false,
        submitted: hasSubmittedPurchaseFeedback(store.id)
      });
    } else {
      setPurchaseFb((s) => ({ ...s, loading: true, submitted: hasSubmittedPurchaseFeedback(store.id) }));
    }

    void getPurchaseFeedbackStats(store.id).then((stats) => {
      if (cancelled) return;
      setPurchaseFb({
        success: stats.successCount,
        failure: stats.failureCount,
        loading: false,
        submitted: hasSubmittedPurchaseFeedback(store.id)
      });
    });
    return () => {
      cancelled = true;
    };
  }, [store.id]);

  const handlePurchaseFeedbackSubmit = useCallback(
    async (type: PurchaseFeedbackType) => {
      const feedbackLabel: "샀어요" | "못 샀어요" = type === "success" ? "샀어요" : "못 샀어요";
      const basePurchaseFeedbackAnalytics = {
        storeId: store.id,
        storeName: store.name,
        feedbackType: type,
        feedbackLabel,
        hasPhoneNumber: Boolean(store.phone?.trim()),
        hasSpecialBag: store.hasSpecialBag,
        hasTrashBag: store.hasTrashBag,
        hasLargeWasteSticker: store.hasLargeWasteSticker
      };

      if (hasSubmittedPurchaseFeedback(store.id)) {
        showToast("이미 알려주셨어요.");
        trackPurchaseFeedbackEvent({
          ...basePurchaseFeedbackAnalytics,
          result: "duplicate",
          isDuplicateAttempt: true
        });
        return;
      }
      if (purchaseFeedbackSubmitLockRef.current) {
        return;
      }
      purchaseFeedbackSubmitLockRef.current = true;
      setPurchaseFeedbackSubmitting(true);
      try {
        setPurchaseFb((s) => ({
          ...s,
          success: type === "success" ? s.success + 1 : s.success,
          failure: type === "failure" ? s.failure + 1 : s.failure
        }));
        try {
          const deviceKey = getOrCreateDeviceKey();
          const res = await submitPurchaseFeedback(store.id, type, deviceKey);
          if (res.persisted) {
            markPurchaseFeedbackSubmitted(store.id, type);
            primePurchaseFeedbackStats(store.id, {
              successCount: res.successCount,
              failureCount: res.failureCount
            });
            setPurchaseFb((s) => ({
              ...s,
              success: res.successCount,
              failure: res.failureCount,
              submitted: true
            }));
            showToast("알려줘서 고마워요!", "purchase");
            trackPurchaseFeedbackEvent({
              ...basePurchaseFeedbackAnalytics,
              result: "success",
              isDuplicateAttempt: false
            });
          } else {
            setPurchaseFb((s) => ({
              ...s,
              success: type === "success" ? Math.max(0, s.success - 1) : s.success,
              failure: type === "failure" ? Math.max(0, s.failure - 1) : s.failure,
              submitted: hasSubmittedPurchaseFeedback(store.id)
            }));
            showToast("반영에 실패했어요. 잠시 후 다시 시도해주세요.");
            trackPurchaseFeedbackEvent({
              ...basePurchaseFeedbackAnalytics,
              result: "error",
              isDuplicateAttempt: false,
              errorMessage: "not_persisted"
            });
          }
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.error("[handlePurchaseFeedbackSubmit]", e);
          }
          setPurchaseFb((s) => ({
            ...s,
            success: type === "success" ? Math.max(0, s.success - 1) : s.success,
            failure: type === "failure" ? Math.max(0, s.failure - 1) : s.failure
          }));
          const devHint =
            process.env.NODE_ENV === "development" && e instanceof Error && e.message
              ? ` (${e.message})`
              : "";
          showToast(`반영에 실패했어요. 잠시 후 다시 시도해주세요.${devHint}`);
          trackPurchaseFeedbackEvent({
            ...basePurchaseFeedbackAnalytics,
            result: "error",
            isDuplicateAttempt: false,
            errorMessage: e instanceof Error ? e.message : "unknown_error"
          });
        }
      } finally {
        purchaseFeedbackSubmitLockRef.current = false;
        setPurchaseFeedbackSubmitting(false);
      }
    },
    [
      showToast,
      store.id,
      store.name,
      store.phone,
      store.hasTrashBag,
      store.hasSpecialBag,
      store.hasLargeWasteSticker
    ]
  );

  const addressLine = (() => {
    const raw = store.roadAddress?.trim() || store.address?.trim() || "";
    return raw ? normalizeProvinceAbbrevForDisplay(raw) : "";
  })();
  const phoneLine = store.phone?.trim();
  const telHref = phoneLine ? `tel:${phoneLine.replace(/\D/g, "")}` : "";

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
      trackEvent("copy_address_click", { store_id: store.id });
      showToast("\uC8FC\uC18C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4");
    } catch {
      // clipboard denied or unavailable
    }
  }, [addressLine, showToast, store.id]);

  const handleShareStore = useCallback(async () => {
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
  const canShare = true;
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
            {isAugmentingDetail ? (
              <div className="flex flex-col gap-3" aria-hidden>
                <div className="h-[22px] w-[88%] max-w-md animate-pulse rounded-[6px] bg-neutral-200" />
                <div className="h-10 w-full animate-pulse rounded-[8px] bg-neutral-100" />
                <div className="flex gap-2">
                  <div className="h-8 w-24 animate-pulse rounded-md bg-neutral-100" />
                  <div className="h-8 w-28 animate-pulse rounded-md bg-neutral-100" />
                </div>
                <div className="flex gap-2 pt-1">
                  <div className="h-4 w-16 animate-pulse rounded bg-neutral-100" />
                  <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
                </div>
              </div>
            ) : (
              <>
                {addressLine || phoneLine ? (
                  <div className="flex flex-col gap-[2px]">
                    {addressLine ? (
                      <button
                        type="button"
                        onClick={() => void copyAddress()}
                        className="flex w-full items-start gap-1 rounded-lg py-0 text-left outline-none transition-colors active:bg-[rgba(23,23,23,0.06)] focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label="Copy address"
                      >
                        <span className="flex shrink-0 items-start" aria-hidden>
                          <img
                            src="/Img/Icon/address_16.svg"
                            alt=""
                            width={16}
                            height={19}
                            className="h-[19px] w-4 shrink-0"
                          />
                        </span>
                        <span className="min-w-0 flex-1 text-[16px] font-normal leading-[1.4] tracking-[0.1px] text-[#555555]">
                          {addressLine}
                        </span>
                      </button>
                    ) : null}
                    {phoneLine ? (
                      <a
                        href={telHref}
                        onClick={() => trackEvent("call_click", { store_id: store.id })}
                        className="flex w-full items-center gap-1 rounded-lg py-0 outline-none transition-colors active:bg-[rgba(23,23,23,0.06)] focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <Image
                          src="/Img/Icon/phone_16.png"
                          alt=""
                          width={16}
                          height={16}
                          className="size-4 shrink-0"
                          sizes="16px"
                        />
                        <span className="text-[16px] font-normal leading-[1.4] tracking-[0.1px] text-[#555555]">
                          {phoneLine}
                        </span>
                      </a>
                    ) : null}
                  </div>
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
                      onClick={() => trackEvent("report_store_click", { store_id: store.id, surface: "store_detail" })}
                      className="text-[14px] font-semibold leading-normal tracking-[0.1px] text-[#111111] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      정보 수정요청
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {!isAugmentingDetail ? (
            <PurchaseFeedbackCard
              storeId={store.id}
              successCount={purchaseFb.success}
              failureCount={purchaseFb.failure}
              showCountRows={purchaseFb.success + purchaseFb.failure > 0}
              isLoading={purchaseFb.loading}
              isSubmitting={purchaseFeedbackSubmitting}
              hasSubmitted={purchaseFb.submitted}
              onSubmit={(t) => void handlePurchaseFeedbackSubmit(t)}
            />
          ) : null}

          <div className="flex w-full gap-1 pb-2">
            {canShare ? (
              <button
                type="button"
                onClick={() => void handleShareStore()}
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
              onClick={() => trackEvent("kakao_map_click", { store_id: store.id })}
              className={`flex h-12 min-w-0 items-center justify-center rounded-[8px] bg-[#171717] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c] ${
                canShare ? "flex-1" : "w-full"
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

      {toast ? (
        <div
          className="pointer-events-none fixed bottom-[max(100px,calc(18dvh+env(safe-area-inset-bottom,0px)))] left-1/2 z-toast max-w-[min(90vw,320px)] -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div
            className={
              toast.variant === "purchase"
                ? "rounded-[999px] bg-[rgba(17,17,17,0.9)] px-6 py-3 text-center text-[14px] font-medium leading-[1.5] text-white shadow-[0px_12px_24px_0px_rgba(0,0,0,0.07)]"
                : "rounded-full bg-[#171717] px-4 py-3 text-center text-[14px] font-semibold leading-normal text-white shadow-elevation-3"
            }
          >
            {toast.message}
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

    </div>
  );
}

export default memo(
  StoreDetailSheetInner,
  (prev, next) =>
    prev.store.id === next.store.id &&
    prev.isAugmentingDetail === next.isAugmentingDetail &&
    prev.kakaoMapsReady === next.kakaoMapsReady &&
    prev.userLocation?.lat === next.userLocation?.lat &&
    prev.userLocation?.lng === next.userLocation?.lng &&
    prev.store.distance === next.store.distance &&
    prev.store.name === next.store.name &&
    (prev.store.roadAddress ?? prev.store.address) === (next.store.roadAddress ?? next.store.address) &&
    (prev.store.phone ?? "") === (next.store.phone ?? "") &&
    prev.store.adminVerified === next.store.adminVerified &&
    prev.store.hasTrashBag === next.store.hasTrashBag &&
    prev.store.hasSpecialBag === next.store.hasSpecialBag &&
    prev.store.hasLargeWasteSticker === next.store.hasLargeWasteSticker &&
    prev.store.lat === next.store.lat &&
    prev.store.lng === next.store.lng &&
    prev.store.shortCode === next.store.shortCode
);
