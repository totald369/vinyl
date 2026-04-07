import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/gtag";

/**
 * Google 태그(gtag.js) — 각 페이지 1회, 루트 layout의 <head> 직후에 삽입.
 * 공식 스니펫과 동등: async gtag/js → dataLayer + gtag + gtag(js) + gtag(config)
 * window.gtag는 클라이언트에서 sendGtagPageView 등에 필요해 유지합니다.
 */
export function GoogleAnalyticsScripts() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  const id = GA_MEASUREMENT_ID;
  const inlineInit = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
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
