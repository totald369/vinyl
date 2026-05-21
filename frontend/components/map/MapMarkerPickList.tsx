"use client";

import type { StoreData } from "@/lib/storeData";

type Props = {
  stores: StoreData[];
  onPick: (store: StoreData) => void;
  onDismiss: () => void;
};

/** 겹친 마커 탭 시 후보 목록 — 클릭 시에만 마운트 (성능 부담 없음) */
export default function MapMarkerPickList({ stores, onPick, onDismiss }: Props) {
  if (stores.length < 2) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-[30] max-h-[min(40vh,240px)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.14)]"
      role="dialog"
      aria-label="근처 판매처 선택"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <p className="text-[13px] font-semibold text-[#171717]">
          근처 판매처 {stores.length}곳
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          닫기
        </button>
      </div>
      <ul className="max-h-[min(36vh,200px)] overflow-y-auto overscroll-contain py-1">
        {stores.map((store) => {
          const label = store.name?.trim() || "판매처";
          const addr = (store.roadAddress || store.address || "").trim();
          return (
            <li key={store.id}>
              <button
                type="button"
                onClick={() => onPick(store)}
                className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left outline-none hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <span className="text-[15px] font-semibold leading-snug text-[#171717]">{label}</span>
                {addr ? (
                  <span className="line-clamp-1 text-[12px] leading-snug text-slate-500">{addr}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
