"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

/** 첫 스크롤·터치 이후 AdSense 로드 — 초기 TBT·네트워크 경합 완화 */
export function LazyAdSense({ client }: { client: string }) {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const onInteraction = () => setLoad(true);
    window.addEventListener("scroll", onInteraction, { once: true, passive: true });
    window.addEventListener("pointerdown", onInteraction, { once: true });
    return () => {
      window.removeEventListener("scroll", onInteraction);
      window.removeEventListener("pointerdown", onInteraction);
    };
  }, []);

  if (!load) return null;

  return (
    <Script
      id="adsbygoogle-loader"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      strategy="lazyOnload"
      crossOrigin="anonymous"
    />
  );
}
