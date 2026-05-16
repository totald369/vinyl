"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * [Web Vitals 측정]
 * - Next.js 빌트인 `useReportWebVitals` 만 사용 (외부 web-vitals 패키지 추가 없음).
 * - `next.config.mjs`의 `experimental.webVitalsAttribution`이 켜져 있어
 *   `metric.attribution`에 LargestShiftSource/LargestShiftTarget(CLS),
 *   EventEntry(INP), Element(LCP) 정보가 채워집니다.
 *
 * 개발 환경: `console.table`로 가독성 좋게 표시.
 * 프로덕션: `window.gtag('event', 'web_vitals', ...)`로 GA4 송신.
 *   기존 `sendGtagEvent` 와는 별도 채널이지만 동일 dataLayer 를 사용하므로 충돌 없음.
 *
 * 측정 대상: web-vitals 라이브러리가 보고하는 모든 metric
 *   (INP, CLS, LCP, FCP, TTFB) + Next.js custom metric(`Next.js-hydration` 등).
 */

type RatingThreshold = { good: number; needsImprovement: number };

const THRESHOLDS: Record<string, RatingThreshold> = {
  INP: { good: 200, needsImprovement: 500 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  LCP: { good: 2500, needsImprovement: 4000 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 }
};

function classify(name: string, value: number): "good" | "needs-improvement" | "poor" | "n/a" {
  const t = THRESHOLDS[name];
  if (!t) return "n/a";
  if (value <= t.good) return "good";
  if (value <= t.needsImprovement) return "needs-improvement";
  return "poor";
}

type AttributionLike = {
  largestShiftTarget?: string;
  largestShiftValue?: number;
  largestShiftTime?: number;
  loadState?: string;
  interactionTarget?: string;
  interactionType?: string;
  interactionTime?: number;
  inputDelay?: number;
  processingDuration?: number;
  presentationDelay?: number;
  element?: string;
  url?: string;
  timeToFirstByte?: number;
  resourceLoadDuration?: number;
  elementRenderDelay?: number;
};

function pickAttribution(name: string, attribution: unknown): Record<string, string | number> {
  const a = (attribution ?? {}) as AttributionLike;
  if (name === "CLS") {
    return {
      shift_target: a.largestShiftTarget ?? "",
      shift_value: a.largestShiftValue ?? 0,
      shift_time: Math.round(a.largestShiftTime ?? 0),
      load_state: a.loadState ?? ""
    };
  }
  if (name === "INP") {
    return {
      interaction_target: a.interactionTarget ?? "",
      interaction_type: a.interactionType ?? "",
      interaction_time: Math.round(a.interactionTime ?? 0),
      input_delay: Math.round(a.inputDelay ?? 0),
      processing_duration: Math.round(a.processingDuration ?? 0),
      presentation_delay: Math.round(a.presentationDelay ?? 0),
      load_state: a.loadState ?? ""
    };
  }
  if (name === "LCP") {
    return {
      element: a.element ?? "",
      url: a.url ?? "",
      time_to_first_byte: Math.round(a.timeToFirstByte ?? 0),
      resource_load_duration: Math.round(a.resourceLoadDuration ?? 0),
      element_render_delay: Math.round(a.elementRenderDelay ?? 0)
    };
  }
  return {};
}

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const { name, value, id, delta } = metric;
    const rating = classify(name, value);
    const isProd = process.env.NODE_ENV === "production";

    if (!isProd) {
      const attribution = pickAttribution(name, (metric as { attribution?: unknown }).attribution);
      try {
        console.table([
          {
            metric: name,
            value: typeof value === "number" ? Number(value.toFixed(2)) : value,
            rating,
            delta: typeof delta === "number" ? Number(delta.toFixed(2)) : delta,
            ...attribution
          }
        ]);
      } catch {
        console.log("[web-vitals]", name, value, rating, attribution);
      }
      return;
    }

    if (typeof window === "undefined") return;

    const attribution = pickAttribution(name, (metric as { attribution?: unknown }).attribution);

    /**
     * GA4 권장 포맷:
     * - event_category: "Web Vitals"
     * - event_label: metric.id (페이지 로드별 고유 ID)
     * - non_interaction: true (직접 사용자 인터랙션 아님 — bounce rate 영향 방지)
     * - value: CLS 만 *1000 (정수화), 나머지는 ms 정수
     */
    const metricValue = name === "CLS" ? Math.round(value * 1000) : Math.round(value);
    const params = {
      event_category: "Web Vitals",
      event_label: id,
      metric_name: name,
      metric_value: metricValue,
      metric_rating: rating,
      metric_delta: name === "CLS" ? Math.round(delta * 1000) : Math.round(delta),
      non_interaction: true,
      ...attribution
    };

    /**
     * gtag 함수가 아직 정의되지 않은 경우(초기 metric 은 GA 스크립트 로드 전에 발생할 수 있음)
     * → 직접 `window.dataLayer.push(['event', ...])` 로 폴백.
     * gtag 가 lazyOnload 후 로드되면 dataLayer 의 큐 이벤트를 자동 처리해 metric 손실 0.
     */
    if (typeof window.gtag === "function") {
      window.gtag("event", "web_vitals", params);
      return;
    }
    (window.dataLayer ??= []).push(["event", "web_vitals", params]);
  });

  return null;
}
