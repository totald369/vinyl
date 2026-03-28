"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { StoreProductChips } from "@/components/StoreProductChips";
import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { shortRegion } from "@/lib/shortAddress";

type Props = {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  activeFilter: StoreListFilter;
  onActiveFilterChange: (value: StoreListFilter) => void;
  /** 필터·검색어 기준 전체 매칭 건수(표시용) */
  totalMatchCount: number;
  /** 현재 화면에 그릴 구간(무한 스크롤) */
  results: StoreData[];
  hasMoreResults: boolean;
  onLoadMoreResults: () => void;
  onSelectStore: (store: StoreData) => void;
};

export default function HomeSearchOverlay({
  open,
  onClose,
  query,
  onQueryChange,
  activeFilter,
  onActiveFilterChange,
  totalMatchCount,
  results,
  hasMoreResults,
  onLoadMoreResults,
  onSelectStore
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !hasMoreResults) return;
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreResults();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [open, hasMoreResults, onLoadMoreResults, results.length, totalMatchCount]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[45] flex flex-col bg-white">
      {/* 홈 검색바와 동일: 상단 16px + safe-area */}
      <div className="flex shrink-0 flex-col gap-2 pt-[calc(16px+env(safe-area-inset-top,0px))]">
        <div className="flex items-start justify-center pr-4">
          <button
            type="button"
            onClick={onClose}
            className="flex size-12 shrink-0 items-center justify-center"
            aria-label="뒤로"
          >
            <img src="/Img/Icon/back_32.svg" alt="" width={32} height={32} className="size-8" />
          </button>
          <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-solid border-[#171717] bg-white px-4 py-2">
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[16px] font-medium leading-normal tracking-[-0.3px] text-[#171717] outline-none placeholder:text-[#999999]"
              placeholder="주소나 업체명을 검색해주세요"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
            />
            {query.trim() ? (
              <div className="relative size-6 shrink-0">
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="absolute left-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-[rgba(23,23,23,0.3)] p-1"
                  aria-label="검색어 지우기"
                >
                  <img src="/Img/Icon/close_32.svg" alt="" width={18} height={18} className="size-[18px]" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 본문 — 검색바 아래 16px, 필터·리스트 사이 gap 16px */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-4">
            <button
              type="button"
              onClick={() => onActiveFilterChange("payBag")}
              className={`flex shrink-0 items-center gap-0.5 rounded-[8px] py-2 pl-2 pr-3 text-[14px] font-semibold leading-normal tracking-[0.1px] ${
                activeFilter === "payBag"
                  ? "border-0 bg-[#171717] text-white"
                  : "border border-[#EEEEEE] bg-white text-[#333333]"
              }`}
            >
              <img src="/Img/Icon/trash_bag_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
              <span className="whitespace-nowrap">종량제봉투</span>
            </button>
            <button
              type="button"
              onClick={() => onActiveFilterChange("largeSticker")}
              className={`flex shrink-0 items-center gap-0.5 rounded-[8px] py-2 pl-2 pr-3 text-[14px] font-semibold leading-normal tracking-[0.1px] ${
                activeFilter === "largeSticker"
                  ? "border-0 bg-[#171717] text-white"
                  : "border border-[#EEEEEE] bg-white text-[#333333]"
              }`}
            >
              <img src="/Img/Icon/sticker_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
              <span className="whitespace-nowrap">폐기물 스티커</span>
            </button>
            <button
              type="button"
              onClick={() => onActiveFilterChange("nonBurnable")}
              className={`flex shrink-0 items-center gap-0.5 rounded-[8px] py-2 pl-2 pr-3 text-[14px] font-semibold leading-normal tracking-[0.1px] ${
                activeFilter === "nonBurnable"
                  ? "border-0 bg-[#171717] text-white"
                  : "border border-[#EEEEEE] bg-white text-[#333333]"
              }`}
            >
              <img src="/Img/Icon/non-fire_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
              <span className="flex flex-col items-start gap-0 leading-[1.15]">
                <span className="whitespace-nowrap">불연성마대</span>
                <span
                  className={`whitespace-nowrap text-[11px] font-medium ${
                    activeFilter === "nonBurnable" ? "text-white/85" : "text-[#555555]"
                  }`}
                >
                  PP마대(건설마대)
                </span>
              </span>
            </button>
          </div>

          {query.trim() ? (
            <p
              className="shrink-0 px-4 text-[13px] font-medium leading-normal tracking-[0.1px] text-[#666666]"
              role="status"
              aria-live="polite"
            >
              총{" "}
              <span className="font-semibold text-[#171717]">
                {totalMatchCount.toLocaleString("ko-KR")}
              </span>
              건의 판매처
            </p>
          ) : null}

          <ul
            ref={listRef}
            className="scrollbar-map-list flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto px-2 pb-4"
          >
            {!query.trim() ? (
              <li className="px-4 py-8 text-center text-[14px] font-normal leading-normal tracking-[0.1px] text-[#999999]">
                검색어를 입력하면 결과가 표시됩니다.
              </li>
            ) : totalMatchCount === 0 ? (
              <li className="flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-4">
                <div className="flex w-full max-w-[375px] flex-col items-center gap-4">
                  <div className="relative size-16 shrink-0 overflow-hidden" aria-hidden>
                    <img src="/Img/Icon/empty_64.svg" alt="" width={64} height={64} className="size-16" />
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex flex-col items-center gap-1 text-center text-[16px] leading-[1.5]">
                      <p className="font-bold text-[#171717]">등록된 판매처가 없습니다.</p>
                      <div className="font-normal text-[#666666]">
                        <p className="mb-0">판매처를 제보해주시면 확인 과정을 거쳐</p>
                        <p>2~3일 내에 업데이트됩니다.</p>
                      </div>
                    </div>
                    {SHOW_HOME_REPORT_BUTTON ? (
                      <Link
                        href="/report"
                        onClick={onClose}
                        className="flex h-12 w-[150px] shrink-0 items-center justify-center rounded-[8px] bg-[#171717] text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c]"
                      >
                        제보하기
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ) : (
              results.map((store, index) => (
                <li key={store.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectStore(store)}
                    className="flex w-full flex-col gap-3 rounded-[8px] px-4 py-4 text-left transition-colors active:bg-[#eff3f4]"
                  >
                    {/* 피그마 754:374 — 상단 블록 gap 12px, 제목·주소 블록 내부 gap 6px */}
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-0.5">
                          <p className="text-[16px] font-semibold leading-normal tracking-[0.1px] text-[#171717]">
                            {store.name}
                          </p>
                          {store.adminVerified ? (
                            <img
                              src="/Img/Icon/confirm_24.svg"
                              alt="확인됨"
                              width={16}
                              height={16}
                              className="size-4 shrink-0"
                            />
                          ) : null}
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-[14px] font-normal leading-normal tracking-[0.1px] text-[#555555]">
                            {shortRegion(store.roadAddress || store.address || "")}
                          </span>
                          {typeof store.distance === "number" ? (
                            <>
                              <span
                                className="h-3 w-px shrink-0 bg-[rgba(23,23,23,0.1)]"
                                aria-hidden
                              />
                              <span className="shrink-0 text-[14px] font-normal leading-normal tracking-[0.1px] text-[#999999]">
                                {store.distance.toFixed(1)}km
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <StoreProductChips store={store} />
                    </div>
                  </button>
                  {index < results.length - 1 ? (
                    <div className="h-px w-full shrink-0 bg-[#f5f5f5]" aria-hidden />
                  ) : null}
                </li>
              ))
            )}
            {query.trim() && hasMoreResults ? (
              <li
                ref={sentinelRef}
                className="flex min-h-[48px] shrink-0 items-center justify-center py-2 text-[12px] text-[#999999]"
                aria-hidden
              >
                스크롤하면 더 불러옵니다…
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* 피그마 754:546 홈 인디케이터 */}
      <div className="h-[33px] w-full shrink-0 bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="relative mx-auto h-full w-[135px]">
          <span className="absolute bottom-2 left-1/2 h-[5px] w-[135px] -translate-x-1/2 rounded-[100px] bg-[#222222]" />
        </div>
      </div>
    </div>
  );
}
