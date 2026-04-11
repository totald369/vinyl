"use client";

import { useEffect } from "react";

/**
 * [디버깅] Core Web Vitals + Long Task를 콘솔에 기록합니다.
 * 개발 또는 NEXT_PUBLIC_DEBUG_CLS=1 일 때만 동작합니다.
 *
 * 관측 항목:
 * - layout-shift (CLS): 어떤 요소에서 shift가 발생하는지 추적
 * - largest-contentful-paint (LCP): LCP 후보 요소와 시간 기록
 * - long-animation-frame / longtask (INP 보조): 50ms 이상 메인 스레드 차단 감지
 */
export default function LayoutShiftObserver() {
  useEffect(() => {
    const enabled =
      process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_CLS === "1";
    if (!enabled || typeof window === "undefined" || !("PerformanceObserver" in window)) return;

    const observers: PerformanceObserver[] = [];

    // --- CLS ---
    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
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
            return { kind: "element" as const, tag: `${tag}${id}`, className: cls || undefined };
          });

          console.warn("[CLS]", { value: Number(ls.value.toFixed(4)), sources });
        }
      });
      clsObs.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObs);
    } catch { /* unsupported */ }

    // --- LCP ---
    try {
      const lcpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const lcp = entry as PerformanceEntry & {
            renderTime: number;
            loadTime: number;
            size: number;
            element?: Element | null;
            url?: string;
          };
          const el = lcp.element;
          const tag = el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}` : "unknown";
          console.info("[LCP]", {
            time: Math.round(lcp.renderTime || lcp.loadTime),
            size: lcp.size,
            element: tag,
            url: lcp.url || undefined
          });
        }
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObs);
    } catch { /* unsupported */ }

    // --- Long Task (INP 보조) ---
    try {
      const ltObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 100) {
            console.warn("[Long Task]", {
              duration: Math.round(entry.duration),
              startTime: Math.round(entry.startTime),
              name: entry.name
            });
          }
        }
      });
      ltObs.observe({ type: "longtask", buffered: true });
      observers.push(ltObs);
    } catch { /* unsupported */ }

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, []);

  return null;
}
