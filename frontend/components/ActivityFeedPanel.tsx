"use client";

import { useMemo, useState } from "react";
import {
  buildActivityMessageParts,
  formatActivityPanelDate,
  getActivityIconSrc,
  getPanelReferenceDate,
  type ActivityItem
} from "@/lib/activityFeed";

type ActivityFeedPanelProps = {
  items: ActivityItem[];
};

function ActivityMessage({ item }: { item: ActivityItem }) {
  const parts = buildActivityMessageParts(item);
  return (
    <p className="min-w-0 flex-1 text-[12px] leading-normal tracking-[0.1px] text-[#666666] [word-break:break-word]">
      {parts.map((part, index) =>
        part.bold ? (
          <span key={index} className="font-bold">
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </p>
  );
}

export default function ActivityFeedPanel({ items }: ActivityFeedPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const referenceDate = useMemo(() => getPanelReferenceDate(items), [items]);

  if (items.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      aria-expanded={expanded}
      className={`pointer-events-auto max-w-[290px] rounded-[12px] border-0 p-3 text-left shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] backdrop-blur-[20px] outline-none transition-[background-color,padding] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand-500 ${
        expanded ? "bg-white/40" : "bg-white/20"
      }`}
    >
      <div className="flex w-full items-center gap-0.5 tracking-[0.1px]">
        <span className="text-[14px] font-bold leading-normal text-black">업데이트 정보</span>
        {referenceDate ? (
          <span className="text-[12px] font-medium leading-normal text-[#999999]">
            {formatActivityPanelDate(referenceDate)}
          </span>
        ) : null}
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out ${
          expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <ul className="flex min-h-0 flex-col gap-1 overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-1">
              <img
                src={getActivityIconSrc(item.type)}
                alt=""
                width={16}
                height={16}
                className="mt-0.5 shrink-0"
                fetchPriority="low"
              />
              <ActivityMessage item={item} />
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}
