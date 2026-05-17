"use client";

import { useEffect, useState } from "react";

type Options = {
  /** 리스트 데이터 준비(로딩 종료 + 1건 이상) */
  listReady: boolean;
  /** 중심·필터 등 바뀔 때 마커를 다시 지연 */
  resetKey: string;
};

/**
 * 리스트 페인트 후 idle 에 마커 표시 — CustomOverlay 대량 생성이 타일 LCP·메인 스레드와 경합하지 않게.
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

    let idleId: number | undefined;
    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(enable, { timeout: 2500 });
    } else {
      idleId = window.setTimeout(enable, 300) as unknown as number;
    }

    return () => {
      cancelled = true;
      if (typeof requestIdleCallback !== "undefined" && idleId != null) {
        cancelIdleCallback(idleId);
      } else if (idleId != null) {
        window.clearTimeout(idleId);
      }
    };
  }, [listReady, resetKey]);

  return showMapMarkers;
}
