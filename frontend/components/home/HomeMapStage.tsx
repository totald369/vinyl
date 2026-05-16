"use client";

/**
 * 변경 전: 홈 루트가 리렌더될 때마다 지도 영역 JSX·dynamic 로더 경로가 함께 재평가.
 * 변경 후: React.memo로 MapView에 전달되는 props가 동일하면(참조 동등) 자식 커밋을 건너뛰기 쉬움.
 * 측정: Profiler에서 MapView 커밋 횟수 vs 부모 커밋 횟수.
 */
import dynamic from "next/dynamic";
import { memo, useEffect, useRef, useState } from "react";
import MapSkeleton from "@/components/MapSkeleton";
import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { LatLng } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Props = {
  kakaoLoading: boolean;
  center: LatLng;
  centerVersion: number;
  preferredMapLevel: number | null;
  stores: StoreData[];
  activeFilter: StoreListFilter;
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  userMarkerPosition: LatLng | null;
};

function HomeMapStageInner({
  kakaoLoading,
  center,
  centerVersion,
  preferredMapLevel,
  stores,
  activeFilter,
  selectedStoreId,
  onSelectStore,
  userMarkerPosition
}: Props) {
  /**
   * [LCP/INP] 지도 컨테이너 lazy mount:
   *  - 초기 페인트는 MapSkeleton 만 (LCP 후보가 작은 placeholder 가 되어 LCP 측정값 안정화).
   *  - IntersectionObserver 로 컨테이너가 뷰포트에 들어올 때 + Kakao SDK 준비됐을 때 MapView mount.
   *  - 홈은 거의 항상 뷰포트 안이지만 첫 페인트 직후 1프레임 양보 → 첫 인터랙션과 SDK 초기화 경합 감소.
   *  - 일정 시간 안에 IO 가 트리거되지 않으면(예: 일부 모바일 브라우저 잠시 hidden) safety 타이머로 mount.
   */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;
    if (typeof window === "undefined") return;

    const SAFETY_FALLBACK_MS = 1200;
    let timer: number | null = null;
    let io: IntersectionObserver | null = null;

    const mountNow = () => {
      setShouldMount(true);
      if (timer != null) window.clearTimeout(timer);
      io?.disconnect();
    };

    timer = window.setTimeout(mountNow, SAFETY_FALLBACK_MS);

    if (typeof IntersectionObserver !== "undefined" && containerRef.current) {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) mountNow();
        },
        { rootMargin: "200px" }
      );
      io.observe(containerRef.current);
    } else {
      mountNow();
    }

    return () => {
      io?.disconnect();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [shouldMount]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {kakaoLoading || !shouldMount ? (
        <MapSkeleton />
      ) : (
        <MapView
          center={center}
          centerVersion={centerVersion}
          preferredMapLevel={preferredMapLevel}
          stores={stores}
          activeFilter={activeFilter}
          selectedStoreId={selectedStoreId}
          onSelectStore={onSelectStore}
          userMarkerPosition={userMarkerPosition}
        />
      )}
    </div>
  );
}

export default memo(HomeMapStageInner);
