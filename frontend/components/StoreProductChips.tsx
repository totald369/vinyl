"use client";

import type { ReactNode } from "react";
import { StoreData } from "@/hooks/useStores";

export function StoreProductChips({ store }: { store: StoreData }) {
  const chips: ReactNode[] = [];

  if (store.hasTrashBag) {
    chips.push(
      <div
        key="pay"
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#e6f4e2] py-1 pl-1.5 pr-2"
      >
        <img src="/Img/Icon/trash_bag_16.svg" alt="" width={16} height={16} className="size-4 shrink-0" />
        <span className="whitespace-nowrap text-[14px] font-medium leading-normal tracking-[0.1px] text-[#356438]">
          종량제봉투
        </span>
      </div>
    );
  }

  if (store.hasLargeWasteSticker) {
    chips.push(
      <div
        key="sticker"
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#e0f5f5] py-1 pl-1.5 pr-2"
      >
        <div className="relative size-4 shrink-0 overflow-hidden">
          <img src="/Img/Icon/sticker_16.svg" alt="" width={16} height={16} className="size-4" />
        </div>
        <span className="whitespace-nowrap text-[14px] font-medium leading-normal tracking-[0.1px] text-[#14a1a1]">
          폐기물 스티커
        </span>
      </div>
    );
  }

  if (store.hasSpecialBag) {
    chips.push(
      <div
        key="non"
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#f8f2dd] py-1 pl-1.5 pr-2"
      >
        <div className="relative size-4 shrink-0 overflow-hidden">
          <img src="/Img/Icon/non-fire_16.svg" alt="" width={16} height={16} className="size-4" />
        </div>
        <span className="whitespace-nowrap text-[14px] font-medium leading-normal tracking-[0.1px] text-[#6f522a]">
          불연성마대
        </span>
      </div>
    );
  }

  if (chips.length === 0) return null;

  return <div className="flex flex-wrap gap-0.5">{chips}</div>;
}
