"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { CLARITY_PROJECT_ID } from "@/lib/clarity";
import { GA_MEASUREMENT_ID } from "@/lib/gtag";

const INTERACTION_EVENTS = ["scroll", "click", "touchstart", "keydown"] as const;
const AUTO_LOAD_MS = 5000;

/**
 * gtag·Clarity — 첫 페인트·LCP 이후 로드 (TBT·메인 스레드 경합 완화).
 * 5초 후 또는 첫 사용자 상호작용 시 로드.
 */
export function DelayedAnalyticsScripts() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;

    const enable = () => setShouldLoad(true);

    const timer = window.setTimeout(enable, AUTO_LOAD_MS);
    const onInteraction = () => {
      enable();
      cleanupListeners();
    };

    const cleanupListeners = () => {
      for (const event of INTERACTION_EVENTS) {
        document.removeEventListener(event, onInteraction);
      }
    };

    for (const event of INTERACTION_EVENTS) {
      document.addEventListener(event, onInteraction, { once: true, passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      cleanupListeners();
    };
  }, [shouldLoad]);

  if (!shouldLoad) return null;

  const gaId = GA_MEASUREMENT_ID;
  const clarityId = CLARITY_PROJECT_ID;

  return (
    <>
      {gaId ? (
        <>
          <Script
            id="ga-gtag-js"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="lazyOnload"
          />
          <Script
            id="ga-gtag-init"
            strategy="lazyOnload"
            dangerouslySetInnerHTML={{
              __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${gaId}', { send_page_view: false });
`.trim()
            }}
          />
        </>
      ) : null}
      {clarityId ? (
        <Script
          id="microsoft-clarity-init"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${clarityId}");
`.trim()
          }}
        />
      ) : null}
    </>
  );
}
