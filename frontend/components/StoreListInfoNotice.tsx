"use client";

import { useState } from "react";

const WHY_DIFFERENT_ITEMS = [
  "매장 상황에 따라 품절 또는 판매 중단될 수 있어요.",
  "판매 품목은 매장 상황에 따라 달라질 수 있어요.",
  "아직 최신정보가 반영되지 않았어요."
] as const;

type StoreListInfoNoticeProps = {
  className?: string;
};

export default function StoreListInfoNotice({ className = "" }: StoreListInfoNoticeProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`flex w-full flex-col pt-2 ${className}`.trim()}>
      <div className="flex items-start gap-0">
        <img
          src="/Img/Icon/info_24.svg"
          alt=""
          width={24}
          height={24}
          className="size-6 shrink-0"
          fetchPriority="low"
        />
        <p className="min-w-0 flex-1 text-[12px] font-normal leading-normal tracking-[0.1px] text-[#666666] [word-break:break-word]">
          판매처 정보는 공공데이터와 사용자 제보를 바탕으로 업데이트됩니다.
        </p>
      </div>

      <div className="w-full">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex w-full items-center border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <img
            src="/Img/Icon/info_help_24.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
            fetchPriority="low"
          />
          <span className="text-[12px] font-bold leading-normal tracking-[0.1px] text-[#333333]">
            왜 정보가 다를 수 있나요?
          </span>
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <ul className="min-h-0 overflow-hidden pl-[18px] text-[12px] font-medium leading-[1.3] tracking-[0.1px] text-[#999999] [word-break:break-word]">
            {WHY_DIFFERENT_ITEMS.map((item) => (
              <li key={item} className="list-disc marker:text-[#999999]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
