"use client";

/**
 * 변경 전: 홈 루트가 리렌더될 때마다 지도 영역 JSX·dynamic 로더 경로가 함께 재평가.
 * 변경 후: React.memo로 MapView에 전달되는 props가 동일하면(참조 동등) 자식 커밋을 건너뛰기 쉬움.
 * [LCP] SDK 준비 전에도 MapView 컨테이너를 마운트해 타일 fetch 를 앞당김(스켈레톤은 오버레이).
 */
import dynamic from "next/dynamic";
import { memo } from "react";
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
  return (
    <div className="kakao-map-root relative h-full w-full">
      <MapView
        mapsReady={!kakaoLoading}
        center={center}
        centerVersion={centerVersion}
        preferredMapLevel={preferredMapLevel}
        stores={stores}
        activeFilter={activeFilter}
        selectedStoreId={selectedStoreId}
        onSelectStore={onSelectStore}
        userMarkerPosition={userMarkerPosition}
      />
      {kakaoLoading ? <MapSkeleton overlay /> : null}
    </div>
  );
}

export default memo(HomeMapStageInner);
