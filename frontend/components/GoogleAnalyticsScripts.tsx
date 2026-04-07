"use client";

import { useEffect } from "react";
import Script from "next/script";
import { GA_DEBUG, GA_MEASUREMENT_ID } from "@/lib/gtag";

/**
 * App Router + next/script GA4 (프로덕션에서만 layout에서 마운트)
 *
 * 테스트 포인트 (배포 URL, 광고차단 끄기):
 * - Network 필터: `googletagmanager` → gtag/js 로드
 * - Network 필터: `collect` 또는 `google-analytics` → g/collect
 * - Console: NEXT_PUBLIC_GA_DEBUG=1 일 때 [GA] 로그 (아래 onLoad)
 * - Console: `typeof window.gtag`, `window.dataLayer`
 *
 * www vs non-www: SITE_URL은 www. non-www는 next.config redirects로 www로 통일.
 */
export function GoogleAnalyticsScripts() {
  const id = GA_MEASUREMENT_ID;

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
      <Script id="ga-gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
    </>
  );
}
