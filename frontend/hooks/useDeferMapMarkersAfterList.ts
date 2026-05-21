"use client";

import { useEffect, useRef, useState } from "react";
import {
  KAKAO_MAP_READY_EVENT,
  wasKakaoMapReadyNotified
} from "@/lib/kakao/createKakaoMap";

type Options = {
  /** 매장 1건 이상(로딩 중이어도 기존 데이터 있으면 true) */
  listReady: boolean;
  /** @deprecated 마커 표시 여부에는 사용하지 않음 */
  resetKey: string;
};

const READY_FALLBACK_MS = 400;

/**
 * 매장 데이터 + 지도 Map 인스턴스 준비 후 마커 표시.
 * 한 번 표시된 뒤 listReady 가 잠깐 false(백그라운드 refetch)여도 마커를 끄지 않음.
 */
export function useDeferMapMarkersAfterList({ listReady }: Options): boolean {
  const [showMapMarkers, setShowMapMarkers] = useState(false);
  const latchedRef = useRef(false);

  useEffect(() => {
    if (!listReady) {
      if (!latchedRef.current) setShowMapMarkers(false);
      return;
    }

    let cancelled = false;

    const enable = () => {
      if (cancelled) return;
      latchedRef.current = true;
      setShowMapMarkers(true);
    };

    if (wasKakaoMapReadyNotified()) {
      enable();
      return;
    }

    window.addEventListener(KAKAO_MAP_READY_EVENT, enable, { once: true });
    const fallback = window.setTimeout(enable, READY_FALLBACK_MS);

    return () => {
      cancelled = true;
      window.removeEventListener(KAKAO_MAP_READY_EVENT, enable);
      window.clearTimeout(fallback);
    };
  }, [listReady]);

  return showMapMarkers;
}
