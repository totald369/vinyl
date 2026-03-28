"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { StoreProductChips } from "@/components/StoreProductChips";
import { StoreData, StoreListFilter } from "@/hooks/useStores";
import {
  BOTTOM_SHEET_TAP_VELOCITY_MAX,
  cycleBottomSheetSnap,
  getBottomSheetSnapGeometry,
  resolveSnapTyFromRelease,
  snapToTy,
  tyToSnapExact,
  type BottomSheetSnap
} from "@/lib/bottomSheetSnap";
import { shortRegion } from "@/lib/shortAddress";

type Props = {
  stores: StoreData[];
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  activeFilter: StoreListFilter;
  onChangeFilter: (value: StoreListFilter) => void;
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  /** 시트를 드래그하는 동안 true (지도 등 상호작용 차단용) */
  onDragActiveChange?: (active: boolean) => void;
};

const EXPANDED_TOP_OFFSET_PX = 108;
const COLLAPSED_HEIGHT_RATIO = 0.35;

function readViewportHeight(): number {
  if (typeof window === "undefined") return 640;
  return window.visualViewport?.height ?? window.innerHeight;
}

function peekHeightPx(): number {
  return Math.max(140, Math.round(readViewportHeight() * COLLAPSED_HEIGHT_RATIO));
}

function sheetFullHeightPx(): number {
  return Math.max(200, Math.round(readViewportHeight() - EXPANDED_TOP_OFFSET_PX));
}

function maxTranslateY(): number {
  const fullH = sheetFullHeightPx();
  const peekH = peekHeightPx();
  return Math.max(0, fullH - peekH);
}

/** 시트가 최대로 펼쳐진 것으로 보는 translateY 상한 (이하일 때만 리스트 스크롤 허용) */
const SHEET_FULLY_OPEN_EPS = 6;
/** 접힘/중간 상태에서 작은 스와이프로 시트가 먼저 반응 (리스트 스크롤보다 우선) */
const LIST_SHEET_NUDGE_PX = 4;
/** 완전 확장 상태에서 시트 접기 시작 임계값 */
const LIST_DRAG_THRESHOLD_PX = 14;
const LIST_FLICK_UP = -0.52;
const LIST_FLICK_DOWN = 0.52;

/** 펼침 높이(translateY=0) 이상으로는 올라가지 않음; 아래로만 살짝 고무줄 */
function rubberClampTy(ty: number, maxTy: number, rubber: boolean): number {
  if (!rubber) return Math.min(maxTy, Math.max(0, ty));
  if (ty < 0) return 0;
  if (ty > maxTy) return maxTy + (ty - maxTy) * 0.32;
  return ty;
}

const SNAP_ORDER: BottomSheetSnap[] = ["expanded", "collapsed"];

export default function BottomSheetList({
  stores,
  selectedStoreId,
  onSelectStore,
  activeFilter,
  onChangeFilter,
  snap,
  onSnapChange,
  onDragActiveChange
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
    startT: number;
    lastY: number;
    lastT: number;
    sheetDragStarted: boolean;
  } | null>(null);

  const [dragTy, setDragTy] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listSheetTouchLock, setListSheetTouchLock] = useState(false);
  const listUlRef = useRef<HTMLUListElement | null>(null);

  const dragTyRafRef = useRef<number | null>(null);
  const pendingDragTyRef = useRef<number | null>(null);

  const cancelDragTyRaf = useCallback(() => {
    if (dragTyRafRef.current != null) {
      cancelAnimationFrame(dragTyRafRef.current);
      dragTyRafRef.current = null;
    }
    pendingDragTyRef.current = null;
  }, []);

  const scheduleSetDragTy = useCallback((ty: number) => {
    pendingDragTyRef.current = ty;
    if (dragTyRafRef.current != null) return;
    dragTyRafRef.current = requestAnimationFrame(() => {
      dragTyRafRef.current = null;
      const v = pendingDragTyRef.current;
      pendingDragTyRef.current = null;
      if (v != null) setDragTy(v);
    });
  }, []);

  useEffect(() => () => cancelDragTyRaf(), [cancelDragTyRaf]);

  const setDragging = useCallback(
    (v: boolean) => {
      setIsDragging(v);
      onDragActiveChange?.(v);
    },
    [onDragActiveChange]
  );

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

  const geom = getBottomSheetSnapGeometry(maxTranslateY());

  useEffect(() => {
    const onResize = () => {
      if (dragTy == null) return;
      const g = getBottomSheetSnapGeometry(maxTranslateY());
      setDragTy((ty) => (ty == null ? ty : Math.min(g.maxTy, Math.max(0, ty))));
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [dragTy]);

  const resolveTranslateY = useCallback(() => {
    if (dragTy != null) return dragTy;
    return snapToTy(snap, geom);
  }, [dragTy, geom, snap]);

  const applyPointerTy = useCallback(
    (clientY: number, startY: number, startTy: number, rubber: boolean) => {
      const maxTy = geom.maxTy;
      const next = startTy + (clientY - startY);
      scheduleSetDragTy(rubberClampTy(next, maxTy, rubber));
    },
    [geom.maxTy, scheduleSetDragTy]
  );

  const finishDrag = useCallback(
    (hardTy: number, lastY: number, lastT: number, releaseY: number, moved: boolean) => {
      cancelDragTyRaf();
      const dt = Math.max(1, performance.now() - lastT);
      const vy = (releaseY - lastY) / dt;
      const meaningfulGesture =
        moved || Math.abs(vy) > BOTTOM_SHEET_TAP_VELOCITY_MAX;
      if (!meaningfulGesture) {
        onSnapChange(cycleBottomSheetSnap(snap));
      } else {
        const targetTy = resolveSnapTyFromRelease(hardTy, vy, geom, true);
        onSnapChange(tyToSnapExact(targetTy, geom));
      }
      setDragTy(null);
    },
    [cancelDragTyRaf, geom, onSnapChange, snap]
  );

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const g = getBottomSheetSnapGeometry(maxTranslateY());
      const startTy = snapToTy(snap, g);
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startTy,
        lastY: e.clientY,
        lastT: performance.now(),
        moved: false
      };
      setDragging(true);
      setDragTy(startTy);
    },
    [setDragging, snap]
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

      const maxTy = geom.maxTy;
      const raw = d.startTy + (e.clientY - d.startY);
      const hardTy = Math.min(maxTy, Math.max(0, raw));
      const moved = d.moved;
      const lastY = d.lastY;
      const lastT = d.lastT;

      dragRef.current = null;
      setDragging(false);

      finishDrag(hardTy, lastY, lastT, e.clientY, moved);
    },
    [finishDrag, geom.maxTy, setDragging]
  );

  const onListPointerDown = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    if (e.button !== 0) return;
    if (dragRef.current) return;
    const now = performance.now();
    listGestureRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startT: now,
      lastY: e.clientY,
      lastT: now,
      sheetDragStarted: false
    };
  }, []);

  const onListPointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const g = listGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;

      g.lastY = e.clientY;
      g.lastT = performance.now();

      const ul = e.currentTarget;
      const gSnap = getBottomSheetSnapGeometry(maxTranslateY());
      const currentTy = dragTy ?? snapToTy(snap, gSnap);
      const EPS = 6;
      const sheetFullyOpen = currentTy <= SHEET_FULLY_OPEN_EPS;

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
      const canOpenMore = currentTy > EPS;
      const canCloseMore = currentTy < gSnap.maxTy - EPS;

      /*
       * 시트가 완전히 펼쳐지기 전: 리스트는 스크롤되지 않음(overflow/touch-none).
       * 작은 수직 움직임으로 시트만 따라옴.
       */
      if (!sheetFullyOpen) {
        if (Math.abs(dy) < LIST_SHEET_NUDGE_PX) return;
        if (dy < 0 && !canOpenMore) return;
        if (dy > 0 && !canCloseMore) return;
      } else {
        if (ul.scrollTop > 0) return;
        if (!(dy > LIST_DRAG_THRESHOLD_PX && canCloseMore)) return;
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

      dragRef.current = {
        pointerId: e.pointerId,
        startY: g.startY,
        startTy: currentTy,
        lastY: e.clientY,
        lastT: performance.now(),
        moved: Math.abs(dy) >= (sheetFullyOpen ? LIST_DRAG_THRESHOLD_PX : LIST_SHEET_NUDGE_PX)
      };
      setDragging(true);
      applyPointerTy(e.clientY, g.startY, currentTy, true);
    },
    [applyPointerTy, dragTy, setDragging, snap]
  );

  const onListPointerUp = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const g = listGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;

      const ul = e.currentTarget;
      const gSnap = getBottomSheetSnapGeometry(maxTranslateY());

      if (g.sheetDragStarted && dragRef.current) {
        try {
          ul.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const d = dragRef.current;
        const raw = d.startTy + (e.clientY - d.startY);
        const hardTy = Math.min(gSnap.maxTy, Math.max(0, raw));
        const lastY = d.lastY;
        const lastT = d.lastT;

        dragRef.current = null;
        setDragging(false);
        setListSheetTouchLock(false);
        listGestureRef.current = null;

        finishDrag(hardTy, lastY, lastT, e.clientY, d.moved);
        return;
      }

      if (ul.scrollTop === 0 && !g.sheetDragStarted) {
        const totalT = performance.now() - g.startT;
        if (totalT > 0 && totalT < 320) {
          const vy = (e.clientY - g.startY) / totalT;
          const idx = SNAP_ORDER.indexOf(snap);
          if (vy < LIST_FLICK_UP && idx > 0) {
            suppressListClickRef.current = true;
            onSnapChange(SNAP_ORDER[idx - 1]);
          } else if (vy > LIST_FLICK_DOWN && idx < SNAP_ORDER.length - 1) {
            suppressListClickRef.current = true;
            onSnapChange(SNAP_ORDER[idx + 1]);
          }
        }
      }

      listGestureRef.current = null;
    },
    [finishDrag, onSnapChange, setDragging, snap]
  );

  const onListPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const g = listGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (g.sheetDragStarted && dragRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = null;
        setDragging(false);
        setListSheetTouchLock(false);
        cancelDragTyRaf();
        setDragTy(null);
      }
      listGestureRef.current = null;
    },
    [cancelDragTyRaf, setDragging]
  );

  const onListClickCapture = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    if (suppressListClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressListClickRef.current = false;
    }
  }, []);

  const fullH = sheetFullHeightPx();
  const translateY = resolveTranslateY();
  const listScrollEnabled = translateY <= SHEET_FULLY_OPEN_EPS;

  useEffect(() => {
    const el = listUlRef.current;
    if (!el || listScrollEnabled) return;
    el.scrollTop = 0;
  }, [listScrollEnabled, snap]);

  useEffect(() => {
    if (isDragging) return;
    setDragTy(null);
  }, [isDragging, snap]);

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

  const handleLabel =
    snap === "expanded" ? "목록 · 아래로 내려 접기" : "목록 · 위로 올려 펼치기";

  return (
    <section
      style={{
        height: fullH,
        transform: `translate3d(0, ${translateY}px, 0)`,
        transition: isDragging
          ? "none"
          : "transform 360ms cubic-bezier(0.25, 0.1, 0.25, 1)",
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
            onSnapChange(cycleBottomSheetSnap(snap));
          }
        }}
        className="flex w-full shrink-0 cursor-grab touch-none select-none flex-col items-center pt-3 pb-4 active:cursor-grabbing"
        aria-label={handleLabel}
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
          className={`scrollbar-map-list flex min-h-0 flex-1 flex-col gap-1 overscroll-y-contain px-2 pb-4 ${
            listScrollEnabled ? "overflow-y-auto" : "overflow-y-hidden"
          } ${listScrolling ? "is-scrolling" : ""} ${
            isDragging || !listScrollEnabled ? "touch-none" : ""
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

export type { BottomSheetSnap };
