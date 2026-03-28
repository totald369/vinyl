"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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

/** 접힘 높이 비율, 펼침 시 상단 여백(px) — 지도 영역과 맞춤 */
const COLLAPSED_HEIGHT_RATIO = 0.35;
const EXPANDED_TOP_OFFSET_PX = 108;

function readViewportHeight(): number {
  if (typeof window === "undefined") return 640;
  return window.visualViewport?.height ?? window.innerHeight;
}

function collapsedHeightPx(): number {
  return Math.max(140, Math.round(readViewportHeight() * COLLAPSED_HEIGHT_RATIO));
}

function expandedHeightPx(): number {
  return Math.max(200, Math.round(readViewportHeight() - EXPANDED_TOP_OFFSET_PX));
}

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

  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    lastY: number;
    lastT: number;
    moved: boolean;
  } | null>(null);

  /** 드래그 중 픽셀 높이; null 이면 expanded 상태에 맞는 기본 높이 */
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  useEffect(() => {
    const onResize = () => {
      if (dragHeightPx == null) return;
      const c = collapsedHeightPx();
      const e = expandedHeightPx();
      setDragHeightPx((h) => (h == null ? h : Math.min(e, Math.max(c, h))));
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [dragHeightPx]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const c = collapsedHeightPx();
      const exp = expandedHeightPx();
      const startH = expanded ? exp : c;
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: startH,
        lastY: e.clientY,
        lastT: performance.now(),
        moved: false
      };
      setIsDragging(true);
      setDragHeightPx(startH);
    },
    [expanded]
  );

  const onDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 6) d.moved = true;
    d.lastY = e.clientY;
    d.lastT = performance.now();
    const c = collapsedHeightPx();
    const exp = expandedHeightPx();
    const next = Math.min(exp, Math.max(c, d.startHeight - dy));
    setDragHeightPx(next);
  }, []);

  const onDragPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      const c = collapsedHeightPx();
      const exp = expandedHeightPx();
      const h = Math.min(exp, Math.max(c, d.startHeight - (e.clientY - d.startY)));
      const moved = d.moved;
      const lastY = d.lastY;
      const lastT = d.lastT;

      dragRef.current = null;
      setIsDragging(false);

      if (!moved) {
        onExpandedChange(!expanded);
        setDragHeightPx(null);
        return;
      }

      const mid = (c + exp) / 2;
      let nextExpanded = h >= mid;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0 && dt < 180) {
        const vy = (e.clientY - lastY) / dt;
        if (vy < -0.35) nextExpanded = true;
        else if (vy > 0.35) nextExpanded = false;
      }

      onExpandedChange(nextExpanded);
      setDragHeightPx(null);
    },
    [expanded, onExpandedChange]
  );

  const sheetHeightPx =
    dragHeightPx ?? (expanded ? expandedHeightPx() : collapsedHeightPx());

  useEffect(() => {
    if (isDragging) return;
    setDragHeightPx(null);
  }, [expanded, isDragging]);

  useEffect(() => {
    if (!selectedStoreId) return;
    const node = itemRefs.current[selectedStoreId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedStoreId]);

  return (
    <section
      style={{
        height: sheetHeightPx,
        transition: isDragging ? "none" : "height 280ms cubic-bezier(0.25, 0.8, 0.25, 1)"
      }}
      className="absolute bottom-0 left-0 right-0 z-sheet flex min-h-0 flex-col rounded-t-[16px] border-t border-border-subtle bg-bg-surface shadow-floating"
    >
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExpandedChange(!expanded);
          }
        }}
        className="flex w-full shrink-0 cursor-grab touch-none select-none flex-col items-center pt-3 pb-4 active:cursor-grabbing"
        aria-label={expanded ? "목록 접기 · 위아래로 밀어 높이 조절" : "목록 펼치기 · 위로 밀어 확장"}
      >
        <span className="pointer-events-none h-1 w-11 rounded-full bg-[rgba(17,17,17,0.15)]" />
      </div>

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
            <span className="whitespace-nowrap">종량제봉투</span>
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
            <span className="whitespace-nowrap">폐기물 스티커</span>
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
