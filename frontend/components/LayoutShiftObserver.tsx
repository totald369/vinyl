"use client";

import { useEffect } from "react";

/**
 * layout-shift 엔트리를 콘솔에 기록합니다. 개발 또는 NEXT_PUBLIC_DEBUG_CLS=1 일 때만 동작합니다.
 */
export default function LayoutShiftObserver() {
  useEffect(() => {
    const enabled =
      process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_CLS === "1";
    if (!enabled || typeof window === "undefined" || !("PerformanceObserver" in window)) return;

    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== "layout-shift") continue;
        const ls = entry as PerformanceEntry & {
          value: number;
          hadRecentInput?: boolean;
          sources?: ReadonlyArray<{
            node?: Node | null;
            previousRect?: DOMRectReadOnly;
            currentRect?: DOMRectReadOnly;
          }>;
        };
        if (ls.hadRecentInput) continue;

        const sources = (ls.sources ?? []).map((s) => {
          const el = s.node;
          if (!(el instanceof Element)) return { kind: "unknown" as const };
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : "";
          const cls =
            typeof el.className === "string"
              ? el.className.split(/\s+/).slice(0, 3).join(".")
              : "";
          return {
            kind: "element" as const,
            tag: `${tag}${id}`,
            className: cls || undefined
          };
        });

        console.warn("[layout-shift]", {
          value: Number(ls.value.toFixed(4)),
          sources
        });
      }
    });

    try {
      po.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
    } catch {
      return undefined;
    }

    return () => po.disconnect();
  }, []);

  return null;
}
