"use client";

import { useEffect } from "react";
import Script from "next/script";
import { GA_DEBUG, GA_MEASUREMENT_ID } from "@/lib/gtag";

/**
 * GA4 필수 순서 (하나라도 빠지면 수집 안 됨):
 * 1) <Script src="https://www.googletagmanager.com/gtag/js?id=측정ID" />
 * 2) window.dataLayer = window.dataLayer || [];
 * 3) function gtag(){ dataLayer.push(arguments); }  → 전역에 window.gtag = gtag
 * 4) gtag('js', new Date());
 * 5) gtag('config', '측정ID');
 *
 * 인라인은 dangerouslySetInnerHTML로 넣어 React/번들이 문자열을 건드리지 않게 함.
 * dataLayer는 window.dataLayer로 명시 (strict/스코프 이슈 방지).
 *
 * 테스트(배포 URL, 광고차단 끄기): typeof window.gtag === "function", window.dataLayer 배열,
 * Network: googletagmanager.com/gtag/js, google-analytics.com/g/collect
 */
export function GoogleAnalyticsScripts() {
  const id = GA_MEASUREMENT_ID;

  const inlineInit = `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${id}');
`.trim();

  useEffect(() => {
    if (!GA_DEBUG || process.env.NODE_ENV !== "production") return;
    const t = window.setTimeout(() => {
      console.log("[GA] tick 직후 — dataLayer 길이:", window.dataLayer?.length);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      <Script
        id="ga-gtag-js"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
        onLoad={() => {
          if (!GA_DEBUG) return;
          console.log(
            "[GA] gtag/js 로드됨 — Network에서 googletagmanager.com/gtag/js?id= 요청 확인"
          );
          console.log("[GA] typeof window.gtag:", typeof window.gtag);
        }}
      />
      <Script
        id="ga-gtag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: inlineInit }}
      />
    </>
  );
}
