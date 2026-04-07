import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/gtag";

/**
 * 서버 컴포넌트 — next/script만 사용 (use client / useEffect 없음).
 * 측정 ID는 lib/gtag의 GA_MEASUREMENT_ID; null이면 아무것도 렌더하지 않음.
 *
 * 필수 스니펫 순서:
 * 1) gtag/js?id=
 * 2) dataLayer + gtag + window.gtag + gtag(js) + gtag(config)
 *
 * 확인: Network `googletagmanager.com/gtag/js`, `google-analytics.com/g/collect`
 *       Console `typeof window.gtag === "function"`, `window.dataLayer`
 */
export function GoogleAnalyticsScripts() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  const id = GA_MEASUREMENT_ID;
  const inlineInit = `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${id}');
`.trim();

  return (
    <>
      <Script
        id="ga-gtag-js"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga-gtag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: inlineInit }}
      />
    </>
  );
}
