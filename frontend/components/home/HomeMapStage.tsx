"use client";

/**
 * MapView 는 LCP(지도 타일) — dynamic import 제거로 청크 waterfall 단축.
 * SDK 준비 전에도 컨테이너·MapView 마운트, mapsReady 시 즉시 타일 요청.
 */
import { memo } from "react";
import MapLcpPlaceholder from "@/components/MapLcpPlaceholder";
import MapSkeleton from "@/components/MapSkeleton";
import MapView from "@/components/MapView";
import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { LatLng } from "@/lib/types";

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
    <div id="kakao-map" className="kakao-map-root relative h-full w-full">
      <MapLcpPlaceholder />
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
      {kakaoLoading ? <MapSkeleton overlay /> : null}
    </div>
  );
}

export default memo(HomeMapStageInner);
