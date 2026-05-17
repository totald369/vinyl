"use client";

import { useEffect, useState } from "react";
import {
  KAKAO_MAP_READY_EVENT,
  wasKakaoMapReadyNotified
} from "@/lib/kakao/createKakaoMap";

type Options = {
  /** 리스트 데이터 준비(로딩 종료 + 1건 이상) */
  listReady: boolean;
  /** @deprecated 마커 표시 여부에는 사용하지 않음(리셋 시 enable 취소 버그 방지) */
  resetKey: string;
};

const READY_FALLBACK_MS = 800;

/**
 * 리스트 준비 + 지도 Map 인스턴스 생성 후 마커 표시.
 */
export function useDeferMapMarkersAfterList({ listReady }: Options): boolean {
  const [showMapMarkers, setShowMapMarkers] = useState(false);

  useEffect(() => {
    if (!listReady) {
      setShowMapMarkers(false);
      return;
    }

    let cancelled = false;

    const enable = () => {
      if (!cancelled) setShowMapMarkers(true);
    };

    if (wasKakaoMapReadyNotified()) {
      enable();
    }

    const onMapReady = () => enable();
    window.addEventListener(KAKAO_MAP_READY_EVENT, onMapReady, { once: true });

    const fallback = window.setTimeout(enable, READY_FALLBACK_MS);

    return () => {
      cancelled = true;
      window.removeEventListener(KAKAO_MAP_READY_EVENT, onMapReady);
      window.clearTimeout(fallback);
    };
  }, [listReady]);

  return showMapMarkers;
}
