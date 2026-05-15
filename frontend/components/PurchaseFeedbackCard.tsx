"use client";

import type { PurchaseFeedbackType } from "@/lib/purchaseFeedbackStorage";

export type PurchaseFeedbackCardProps = {
  storeId: string;
  successCount: number;
  failureCount: number;
  /** true면 Figma StoreDetail(데이터 있음) — 카운트 두 줄 노출 */
  showCountRows: boolean;
  isLoading: boolean;
  /** API 응답 전까지 버튼 비활성·대체 UI — 연타로 중복 insert 방지 */
  isSubmitting?: boolean;
  hasSubmitted: boolean;
  onSubmit: (type: PurchaseFeedbackType) => void;
};

/** Figma 155:703 — 집계 없음·미선택 시 안내 2줄 + 버튼만 */
function EmptyPurchaseFeedbackPrompt({
  disabled,
  isSubmitting,
  onSubmit
}: {
  disabled: boolean;
  isSubmitting: boolean;
  onSubmit: (type: PurchaseFeedbackType) => void;
}) {
  const buttonsDisabled = disabled || isSubmitting;
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center leading-[1.5] not-italic whitespace-nowrap">
      <div className="flex flex-col items-center">
        <p className="text-[16px] font-bold text-black">방문 후 구매 여부를 알려주세요.</p>
        <p className="text-[14px] font-medium text-[#666666]">다른 사용자의 헛걸음을 줄일 수 있어요.</p>
      </div>
      {isSubmitting ? (
        <div
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#dddddd] bg-white text-[14px] font-medium text-[#666666]"
          aria-live="polite"
          aria-busy="true"
          aria-label="구매 여부 보내는 중"
        >
          <span
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-[#dddddd] border-t-[#171717]"
            aria-hidden
          />
          보내는 중…
        </div>
      ) : (
        <div className="flex w-full gap-1 font-bold text-[#171717]">
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={() => onSubmit("success")}
            className="flex h-12 min-w-[60px] flex-1 items-center justify-center gap-0.5 rounded-lg border border-[#dddddd] bg-white px-4 py-2 text-[16px] leading-[1.5] outline-none transition-opacity disabled:cursor-not-allowed disabled:opacity-40 active:bg-[rgba(23,23,23,0.04)] focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="이 판매처에서 구매했어요"
          >
            샀어요<span className="text-[20px] leading-none">👍</span>
          </button>
          <button
            type="button"
            disabled={buttonsDisabled}
            onClick={() => onSubmit("failure")}
            className="flex h-12 min-w-[60px] flex-1 items-center justify-center gap-0.5 rounded-lg border border-[#dddddd] bg-white px-4 py-2 text-[16px] leading-[1.5] outline-none transition-opacity disabled:cursor-not-allowed disabled:opacity-40 active:bg-[rgba(23,23,23,0.04)] focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="이 판매처에서 구매하지 못했어요"
          >
            못 샀어요<span className="text-[20px] leading-none">😭</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * StoreDetail 바텀시트 — 구매 피드백
 * - 집계 없음·미선택: Figma 155:412 / 155:703 (추가 문구·제목·구분선 없음)
 * - 집계 있음·미선택: Figma 89:3065
 * - 제출 후 집계 0: 비표시 / 집계 있음: 제목+카운트만
 */
export function PurchaseFeedbackCard({
  storeId,
  successCount,
  failureCount,
  showCountRows,
  isLoading,
  isSubmitting = false,
  hasSubmitted,
  onSubmit
}: PurchaseFeedbackCardProps) {
  const total = successCount + failureCount;

  const countBlock = showCountRows ? (
    <div className="flex flex-col gap-2">
      <p className="text-left text-[0] leading-none">
        <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">최근 3일 동안 </span>
        <span className="text-[14px] font-bold leading-[1.5] text-[#07c01c]">{successCount}명</span>
        <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">이 </span>
        <span className="text-[14px] font-bold leading-[1.5] text-[#171717]">구매했어요.</span>
      </p>
      <p className="text-left text-[0] leading-none">
        <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">최근 3일 동안 </span>
        <span className="text-[14px] font-bold leading-[1.5] text-[#fc6363]">{failureCount}명</span>
        <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">이 </span>
        <span className="text-[14px] font-bold leading-[1.5] text-[#171717]">못 샀다고 </span>
        <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">알려줬어요.</span>
      </p>
    </div>
  ) : null;

  if (hasSubmitted && total === 0) {
    return null;
  }

  if (hasSubmitted && total > 0) {
    const summaryCounts = (
      <div className="flex flex-col gap-2">
        <p className="text-left text-[0] leading-none">
          <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">최근 3일 동안 </span>
          <span className="text-[14px] font-bold leading-[1.5] text-[#07c01c]">{successCount}명</span>
          <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">이 </span>
          <span className="text-[14px] font-bold leading-[1.5] text-[#171717]">구매했어요.</span>
        </p>
        <p className="text-left text-[0] leading-none">
          <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">최근 3일 동안 </span>
          <span className="text-[14px] font-bold leading-[1.5] text-[#fc6363]">{failureCount}명</span>
          <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">이 </span>
          <span className="text-[14px] font-bold leading-[1.5] text-[#171717]">못 샀다고 </span>
          <span className="text-[14px] font-normal leading-[1.5] text-[#171717]">알려줬어요.</span>
        </p>
      </div>
    );
    return (
      <section
        className="w-full rounded-[12px] bg-[#f7f7f7] p-4"
        aria-labelledby={`purchase-feedback-title-${storeId}`}
      >
        <div className="flex flex-col gap-2">
          <h3
            id={`purchase-feedback-title-${storeId}`}
            className="text-left text-[16px] font-bold leading-[1.5] text-[#171717]"
          >
            최근 구매 확인
          </h3>
          {summaryCounts}
        </div>
      </section>
    );
  }

  if (!showCountRows) {
    return (
      <section
        className="w-full rounded-[12px] border border-[#eeeeee] bg-[#f7f7f7] p-4"
        aria-label="최근 구매 확인"
      >
        {isLoading ? (
          <div
            className="flex w-full flex-col items-center gap-3 text-center leading-[1.5]"
            aria-busy="true"
            aria-label="구매 확인 정보 로딩 중"
          >
            <div className="flex flex-col items-center gap-1">
              <div className="h-5 w-56 max-w-full animate-pulse rounded bg-neutral-200" />
              <div className="h-4 w-48 max-w-full animate-pulse rounded bg-neutral-200" />
            </div>
            <div className="flex w-full gap-1">
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-neutral-200" />
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-neutral-200" />
            </div>
          </div>
        ) : (
          <EmptyPurchaseFeedbackPrompt
            disabled={hasSubmitted || isLoading}
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
          />
        )}
      </section>
    );
  }

  return (
    <section
      className="w-full rounded-[12px] bg-[#f7f7f7] p-4"
      aria-labelledby={`purchase-feedback-title-${storeId}`}
    >
      {isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="구매 확인 정보 로딩 중">
          <div className="flex flex-col gap-2">
            <div className="h-5 w-36 animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-[90%] animate-pulse rounded bg-neutral-200" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-px w-full bg-[rgba(17,17,17,0.07)]" />
            <div className="flex flex-col gap-3">
              <div className="mx-auto h-4 w-48 animate-pulse rounded bg-neutral-200" />
              <div className="mx-auto h-4 w-56 animate-pulse rounded bg-neutral-200" />
              <div className="flex gap-1">
                <div className="h-12 flex-1 animate-pulse rounded-lg bg-neutral-200" />
                <div className="h-12 flex-1 animate-pulse rounded-lg bg-neutral-200" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3
              id={`purchase-feedback-title-${storeId}`}
              className="text-left text-[16px] font-bold leading-[1.5] text-[#171717]"
            >
              최근 구매 확인
            </h3>
            {countBlock}
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-px w-full shrink-0 bg-[rgba(17,17,17,0.07)]" aria-hidden />
            <EmptyPurchaseFeedbackPrompt
              disabled={hasSubmitted || isLoading}
              isSubmitting={isSubmitting}
              onSubmit={onSubmit}
            />
          </div>
        </div>
      )}
    </section>
  );
}
