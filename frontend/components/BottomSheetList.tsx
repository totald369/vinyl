"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreProductChips } from "@/components/StoreProductChips";
import { StoreData, StoreListFilter } from "@/hooks/useStores";
import { shortRegion } from "@/lib/shortAddress";

type Props = {
  stores: StoreData[];
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  activeFilter: StoreListFilter;
  onChangeFilter: (value: StoreListFilter) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

export default function BottomSheetList({
  stores,
  selectedStoreId,
  onSelectStore,
  activeFilter,
  onChangeFilter,
  expanded,
  onExpandedChange
}: Props) {
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listScrolling, setListScrolling] = useState(false);

  const SCROLLBAR_HIDE_MS = 700;

  const handleListScroll = useCallback(() => {
    setListScrolling(true);
    if (scrollHideTimerRef.current) {
      clearTimeout(scrollHideTimerRef.current);
    }
    scrollHideTimerRef.current = setTimeout(() => {
      setListScrolling(false);
      scrollHideTimerRef.current = null;
    }, SCROLLBAR_HIDE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current) {
        clearTimeout(scrollHideTimerRef.current);
      }
    };
  }, []);

  const sheetLayoutClass = useMemo(
    () =>
      expanded ? "top-[108px] bottom-0" : "top-auto bottom-0 h-[298px]",
    [expanded]
  );

  useEffect(() => {
    if (!selectedStoreId) return;
    const node = itemRefs.current[selectedStoreId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedStoreId]);

  return (
    <section
      className={`absolute bottom-0 left-0 right-0 z-sheet flex min-h-0 flex-col rounded-t-[16px] border-t border-border-subtle bg-bg-surface shadow-floating transition-[top,height,max-height] duration-300 ease-out ${sheetLayoutClass}`}
    >
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className="flex w-full shrink-0 flex-col items-center pt-3 pb-4"
        aria-label={expanded ? "목록 접기" : "목록 펼치기"}
      >
        <span className="h-1 w-11 rounded-full bg-[rgba(17,17,17,0.15)]" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-4 pb-4">
          <button
            type="button"
            onClick={() => onChangeFilter("payBag")}
            className={`flex shrink-0 items-center gap-0.5 rounded-[8px] py-2 pl-2 pr-3 text-[14px] font-semibold leading-normal tracking-[0.1px] ${
              activeFilter === "payBag"
                ? "border-0 bg-[#171717] text-white"
                : "border border-[#EEEEEE] bg-white text-[#333333]"
            }`}
          >
            <img src="/Img/Icon/trash_bag_24.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            <span className="whitespace-nowrap">종량제 봉투</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeFilter("largeSticker")}
            className={`flex shrink-0 items-center gap-0.5 rounded-[8px] py-2 pl-2 pr-3 text-[14px] font-semibold leading-normal tracking-[0.1px] ${
              activeFilter === "largeSticker"
                ? "border-0 bg-[#171717] text-white"
                : "border border-[#EEEEEE] bg-white text-[#333333]"
            }`}
          >
            <img src="/Img/Icon/sticker_24.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            <span className="whitespace-nowrap">대형폐기물스티커</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeFilter("nonBurnable")}
            className={`flex shrink-0 items-center gap-0.5 rounded-[8px] py-2 pl-2 pr-3 text-[14px] font-semibold leading-normal tracking-[0.1px] ${
              activeFilter === "nonBurnable"
                ? "border-0 bg-[#171717] text-white"
                : "border border-[#EEEEEE] bg-white text-[#333333]"
            }`}
          >
            <img src="/Img/Icon/non-fire_24.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            <span className="whitespace-nowrap">불연성마대</span>
          </button>
        </div>

        <ul
          onScroll={handleListScroll}
          className={`scrollbar-map-list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4 ${
            listScrolling ? "is-scrolling" : ""
          }`}
        >
          {stores.length === 0 ? (
            <li className="px-4 py-6 text-center text-[14px] leading-normal tracking-[0.1px] text-[#999999]">
              주변에 표시할 판매처가 없습니다.
            </li>
          ) : (
            stores.map((store, index) => {
              const selected = selectedStoreId === store.id;
              return (
                <Fragment key={store.id}>
                  <li
                    ref={(el) => {
                      itemRefs.current[store.id] = el;
                    }}
                    role="button"
                    tabIndex={0}
                    aria-current={selected ? "true" : undefined}
                    className="cursor-pointer rounded-[8px] bg-transparent px-4 py-4 transition-colors hover:bg-[#eff3f4] active:bg-[#eff3f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={() => onSelectStore(store)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectStore(store);
                      }
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[18px] font-semibold leading-normal tracking-[0.1px] text-[#171717]">
                          {store.name}
                        </p>
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 truncate text-[14px] font-normal leading-normal tracking-[0.1px] text-[#555555]">
                            {shortRegion(store.roadAddress || store.address || "")}
                          </p>
                          {typeof store.distance === "number" ? (
                            <>
                              <span
                                className="h-3 w-px shrink-0 bg-[rgba(23,23,23,0.1)]"
                                aria-hidden
                              />
                              <p className="shrink-0 text-[14px] font-normal leading-normal tracking-[0.1px] text-[#999999]">
                                {store.distance.toFixed(1)}km
                              </p>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <StoreProductChips store={store} />
                    </div>
                  </li>
                  {index < stores.length - 1 ? (
                    <div className="h-px w-full shrink-0 bg-[#f5f5f5]" aria-hidden />
                  ) : null}
                </Fragment>
              );
            })
          )}
        </ul>
      </div>
    </section>
  );
}
