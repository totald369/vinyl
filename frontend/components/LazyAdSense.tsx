"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const AUTO_LOAD_MS = 10_000;
const INTERACTION_EVENTS = ["scroll", "click", "touchstart"] as const;

/**
 * AdSense — LCP·critical path 이후 로드 (10초 또는 첫 상호작용).
 */
export function LazyAdSense({ client }: { client: string }) {
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

  return (
    <Script
      id="adsbygoogle-loader"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      strategy="lazyOnload"
      crossOrigin="anonymous"
    />
  );
}
