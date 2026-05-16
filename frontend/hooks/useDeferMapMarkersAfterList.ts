"use client";

import { useEffect, useState } from "react";

type Options = {
  /** 리스트 데이터 준비(로딩 종료 + 1건 이상) */
  listReady: boolean;
  /** 중심·필터 등 바뀔 때 마커를 다시 지연 */
  resetKey: string;
};

/**
 * 리스트가 먼저 페인트된 뒤 지도 마커를 켠다.
 * MapView CustomOverlay diff 는 수백 개 DOM을 한꺼번에 붙여 메인 스레드를 막기 쉬움.
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

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(enable);
    });
    const fallback = window.setTimeout(enable, 900);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
    };
  }, [listReady, resetKey]);

  return showMapMarkers;
}
