"use client";

import { useEffect } from "react";
import {
  KAKAO_MAP_READY_EVENT,
  KAKAO_MAP_TILES_LOADED_EVENT,
  wasKakaoMapReadyNotified
} from "@/lib/kakao/createKakaoMap";

/** 첫 지도 타일(또는 map-ready) 후 SSR LCP placeholder 페이드아웃 */
export default function HomeMapLcpDismiss() {
  useEffect(() => {
    const el = document.getElementById("home-lcp-placeholder");
    if (!el) return;

    const hide = () => {
      el.style.opacity = "0";
    };

    if (wasKakaoMapReadyNotified()) {
      hide();
      return;
    }

    window.addEventListener(KAKAO_MAP_TILES_LOADED_EVENT, hide, { once: true });
    window.addEventListener(KAKAO_MAP_READY_EVENT, hide, { once: true });
    return () => {
      window.removeEventListener(KAKAO_MAP_TILES_LOADED_EVENT, hide);
      window.removeEventListener(KAKAO_MAP_READY_EVENT, hide);
    };
  }, []);

  return null;
}
