"use client";

/**
 * 검색 고정 반경(fetch listReference)에 쓰이는 탐색 앵커만 분리.
 *
 * 변경 전후: 동작 동일 — `manualCenter`·`mapCenterOverride`·`centerVersion`은 `defaultCenter`(useStores)와 같은 틱에서 초기화되어야 해 HomeClient에 유지.
 * 측정: 해당 상태만 단위 테스트·재사용 가능(정성).
 */
import { useState } from "react";
import type { LatLng } from "@/lib/types";

export function useMapCenterController() {
  const [exploreAnchor, setExploreAnchor] = useState<LatLng | null>(null);
  const [mapCenterOverride, setMapCenterOverride] = useState<LatLng | null>(null);

  return {
    exploreAnchor,
    setExploreAnchor,
    mapCenterOverride,
    setMapCenterOverride
  };
}
