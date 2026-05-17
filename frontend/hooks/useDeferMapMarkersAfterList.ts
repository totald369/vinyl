"use client";

import { useEffect, useState } from "react";
import { KAKAO_MAP_TILES_LOADED_EVENT } from "@/lib/kakao/createKakaoMap";

type Options = {
  /** 리스트 데이터 준비(로딩 종료 + 1건 이상) */
  listReady: boolean;
  /** 중심·필터 등 바뀔 때 마커를 다시 지연 */
  resetKey: string;
};

const TILES_FALLBACK_MS = 4000;

/**
 * 리스트 준비 + 지도 첫 tilesloaded 이후 마커 표시 (타일 LCP·메인 스레드 경합 완화).
 */
export function useDeferMapMarkersAfterList({ listReady, resetKey }: Options): boolean {
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

    const onTilesLoaded = () => enable();
    window.addEventListener(KAKAO_MAP_TILES_LOADED_EVENT, onTilesLoaded, { once: true });

    const fallback = window.setTimeout(enable, TILES_FALLBACK_MS);

    return () => {
      cancelled = true;
      window.removeEventListener(KAKAO_MAP_TILES_LOADED_EVENT, onTilesLoaded);
      window.clearTimeout(fallback);
    };
  }, [listReady, resetKey]);

  return showMapMarkers;
}
