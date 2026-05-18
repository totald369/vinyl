"use client";

import { useEffect } from "react";
import { KAKAO_MAP_TILES_LOADED_EVENT } from "@/lib/kakao/createKakaoMap";

/** 첫 지도 타일 페인트 후 SSR LCP placeholder 페이드아웃 (map-ready 보다 늦게) */
export default function HomeMapLcpDismiss() {
  useEffect(() => {
    const el = document.getElementById("home-lcp-placeholder");
    if (!el) return;

    const hide = () => {
      el.style.opacity = "0";
    };

    window.addEventListener(KAKAO_MAP_TILES_LOADED_EVENT, hide, { once: true });
    return () => {
      window.removeEventListener(KAKAO_MAP_TILES_LOADED_EVENT, hide);
    };
  }, []);

  return null;
}
