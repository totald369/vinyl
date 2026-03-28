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

/** 맵이 보이도록 남기는 상단 여백(px) */
const EXPANDED_TOP_OFFSET_PX = 108;
/** 접힘 시 화면에 보이는 시트 높이 비율 */
const COLLAPSED_HEIGHT_RATIO = 0.35;

function readViewportHeight(): number {
  if (typeof window === "undefined") return 640;
  return window.visualViewport?.height ?? window.innerHeight;
}

function peekHeightPx(): number {
  return Math.max(140, Math.round(readViewportHeight() * COLLAPSED_HEIGHT_RATIO));
}

/** 시트 DOM 높이(최대 펼침과 동일) */
function sheetFullHeightPx(): number {
  return Math.max(200, Math.round(readViewportHeight() - EXPANDED_TOP_OFFSET_PX));
}

/** 아래로 밀어 숨길 거리: 전체 높이 − 말고 올라온(peek) 높이 */
function maxTranslateY(): number {
  const fullH = sheetFullHeightPx();
  const peekH = peekHeightPx();
  return Math.max(0, fullH - peekH);
}

const LIST_TO_SHEET_DRAG_PX = 14;
const LIST_FLICK_VELOCITY = -0.55;
const LIST_FLICK_DOWN_VELOCITY = 0.55;

/** 드래그 중 경계 밖 살짝 당김(고무줄) */
function rubberClampTy(ty: number, maxTy: number, rubber: boolean): number {
  if (!rubber) return Math.min(maxTy, Math.max(0, ty));
  if (ty < 0) return ty * 0.32;
  if (ty > maxTy) return maxTy + (ty - maxTy) * 0.32;
  return ty;
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
  const suppressListClickRef = useRef(false);

  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startTy: number;
    lastY: number;
    lastT: number;
    moved: boolean;
  } | null>(null);

  const listGestureRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    lastT: number;
    sheetDragStarted: boolean;
  } | null>(null);

  /** 드래그 중 translateY(px). null이면 expanded에 맞춤 */
  const [dragTy, setDragTy] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listSheetTouchLock, setListSheetTouchLock] = useState(false);
  const listUlRef = useRef<HTMLUListElement | null>(null);

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
      if (dragTy == null) return;
      const maxTy = maxTranslateY();
      setDragTy((ty) => (ty == null ? ty : Math.min(maxTy, Math.max(0, ty))));
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [dragTy]);

  const resolveTranslateY = useCallback(() => {
    const maxTy = maxTranslateY();
    if (dragTy != null) return dragTy;
    return expanded ? 0 : maxTy;
  }, [dragTy, expanded]);

  const applyPointerTy = useCallback((clientY: number, startY: number, startTy: number, rubber: boolean) => {
    const maxTy = maxTranslateY();
    const next = startTy + (clientY - startY);
    setDragTy(rubberClampTy(next, maxTy, rubber));
  }, []);

  const snapFromTy = useCallback(
    (hardTy: number, lastY: number, lastT: number, releaseY: number, moved: boolean) => {
      const maxTy = maxTranslateY();
      if (!moved) {
        onExpandedChange(!expanded);
        setDragTy(null);
        return;
      }
      const mid = maxTy / 2;
      let nextExpanded = hardTy < mid;
      const dt = performance.now() - lastT;
      if (dt > 0 && dt < 200) {
        const vy = (releaseY - lastY) / dt;
        if (vy < -0.35) nextExpanded = true;
        else if (vy > 0.35) nextExpanded = false;
      }
      onExpandedChange(nextExpanded);
      setDragTy(null);
    },
    [expanded, onExpandedChange]
  );

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const maxTy = maxTranslateY();
      const startTy = expanded ? 0 : maxTy;
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startTy,
        lastY: e.clientY,
        lastT: performance.now(),
        moved: false
      };
      setIsDragging(true);
      setDragTy(startTy);
    },
    [expanded]
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - d.startY;
      if (Math.abs(dy) > 6) d.moved = true;
      d.lastY = e.clientY;
      d.lastT = performance.now();
      applyPointerTy(e.clientY, d.startY, d.startTy, true);
    },
    [applyPointerTy]
  );

  const onDragPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const maxTy = maxTranslateY();
      const raw = d.startTy + (e.clientY - d.startY);
      const hardTy = Math.min(maxTy, Math.max(0, raw));
      const moved = d.moved;
      const lastY = d.lastY;
      const lastT = d.lastT;

      dragRef.current = null;
      setIsDragging(false);

      snapFromTy(hardTy, lastY, lastT, e.clientY, moved);
    },
    [snapFromTy]
  );

  const onListPointerDown = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      if (e.button !== 0) return;
      if (dragRef.current) return;
      listGestureRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        lastY: e.clientY,
        lastT: performance.now(),
        sheetDragStarted: false
      };
    },
    []
  );

  const onListPointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const g = listGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;

      g.lastY = e.clientY;
      g.lastT = performance.now();

      const ul = e.currentTarget;

      if (g.sheetDragStarted) {
        const d = dragRef.current;
        if (!d) return;
        e.preventDefault();
        applyPointerTy(e.clientY, d.startY, d.startTy, true);
        d.lastY = e.clientY;
        d.lastT = performance.now();
        if (Math.abs(e.clientY - d.startY) > 6) d.moved = true;
        return;
      }

      const dy = e.clientY - g.startY;

      if (!expanded) {
        if (ul.scrollTop > 0) return;
        if (dy > -LIST_TO_SHEET_DRAG_PX) return;
      } else {
        if (ul.scrollTop > 0) return;
        if (dy < LIST_TO_SHEET_DRAG_PX) return;
      }

      g.sheetDragStarted = true;
      suppressListClickRef.current = true;
      setListSheetTouchLock(true);
      e.preventDefault();
      try {
        ul.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const maxTy = maxTranslateY();
      const startTy = expanded ? 0 : maxTy;
      dragRef.current = {
        pointerId: e.pointerId,
        startY: g.startY,
        startTy,
        lastY: e.clientY,
        lastT: performance.now(),
        moved: true
      };
      setIsDragging(true);
      applyPointerTy(e.clientY, g.startY, startTy, true);
    },
    [applyPointerTy, expanded]
  );

  const onListPointerUp = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const g = listGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;

      const ul = e.currentTarget;

      if (g.sheetDragStarted && dragRef.current) {
        try {
          ul.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const d = dragRef.current;
        const maxTy = maxTranslateY();
        const raw = d.startTy + (e.clientY - d.startY);
        const hardTy = Math.min(maxTy, Math.max(0, raw));
        const lastY = d.lastY;
        const lastT = d.lastT;

        dragRef.current = null;
        setIsDragging(false);
        setListSheetTouchLock(false);
        listGestureRef.current = null;

        snapFromTy(hardTy, lastY, lastT, e.clientY, d.moved);
        return;
      }

      if (ul.scrollTop === 0 && !g.sheetDragStarted) {
        const dt = performance.now() - g.lastT;
        if (dt > 0 && dt < 220) {
          const vy = (e.clientY - g.lastY) / dt;
          if (!expanded && vy < LIST_FLICK_VELOCITY) {
            suppressListClickRef.current = true;
            onExpandedChange(true);
          } else if (expanded && vy > LIST_FLICK_DOWN_VELOCITY) {
            suppressListClickRef.current = true;
            onExpandedChange(false);
          }
        }
      }

      listGestureRef.current = null;
    },
    [expanded, onExpandedChange, snapFromTy]
  );

  const onListPointerCancel = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    const g = listGestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (g.sheetDragStarted && dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
      setIsDragging(false);
      setListSheetTouchLock(false);
      setDragTy(null);
    }
    listGestureRef.current = null;
  }, []);

  const onListClickCapture = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    if (suppressListClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressListClickRef.current = false;
    }
  }, []);

  const fullH = sheetFullHeightPx();
  const translateY = resolveTranslateY();

  useEffect(() => {
    if (isDragging) return;
    setDragTy(null);
  }, [expanded, isDragging]);

  useEffect(() => {
    const el = listUlRef.current;
    if (!el || !listSheetTouchLock) return;
    const blockScroll = (ev: TouchEvent) => {
      ev.preventDefault();
    };
    el.addEventListener("touchmove", blockScroll, { passive: false });
    return () => el.removeEventListener("touchmove", blockScroll);
  }, [listSheetTouchLock]);

  useEffect(() => {
    if (!selectedStoreId) return;
    const node = itemRefs.current[selectedStoreId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedStoreId]);

  return (
    <section
      style={{
        height: fullH,
        transform: `translate3d(0, ${translateY}px, 0)`,
        transition: isDragging
          ? "none"
          : "transform 340ms cubic-bezier(0.32, 0.72, 0, 1)",
        willChange: isDragging ? "transform" : "auto"
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
        aria-label={expanded ? "목록 접기 · 아래로 밀어 내리기" : "목록 펼치기 · 위로 밀어 올리기"}
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
          ref={listUlRef}
          onScroll={handleListScroll}
          onPointerDown={onListPointerDown}
          onPointerMove={onListPointerMove}
          onPointerUp={onListPointerUp}
          onPointerCancel={onListPointerCancel}
          onClickCapture={onListClickCapture}
          className={`scrollbar-map-list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4 ${
            listScrolling ? "is-scrolling" : ""
          } ${isDragging ? "touch-none" : ""}`}
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
