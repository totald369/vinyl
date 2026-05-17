"use client";

import { memo } from "react";
import ClientMountedMapShell from "@/components/map/ClientMountedMapShell";
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
    <ClientMountedMapShell kakaoLoading={kakaoLoading}>
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
    </ClientMountedMapShell>
  );
}

export default memo(HomeMapStageInner);
