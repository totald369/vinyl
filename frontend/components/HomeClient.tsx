"use client";

import Link from "next/link";
import { useEffect } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import StoreCard from "@/components/ui/StoreCard";
import KakaoMapSection from "@/components/map/KakaoMapSection";
import PermissionModal from "@/components/PermissionModal";
import SearchControls from "@/components/SearchControls";
import { DEFAULT_REGION } from "@/lib/types";
import { useMapStore } from "@/stores/useMapStore";
import { usePermissionStore } from "@/stores/usePermissionStore";
import { useStoreListStore } from "@/stores/useStoreListStore";

export default function HomeClient() {
  const { center, listMode, mapMoved, bounds, setCenter, setListMode, markMapMoved, setBounds } =
    useMapStore();
  const {
    permission,
    permissionModalOpen,
    setPermission,
    openPermissionModal,
    closePermissionModal,
    checkPermissionAndRequestMyLocation
  } = usePermissionStore();
  const {
    contentState,
    query,
    selectedFilters,
    visibleStores,
    initializeStores,
    setQuery,
    toggleFilter,
    filterByBounds,
    applyAllFilters
  } = useStoreListStore();

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setPermission("denied");
      setListMode("defaultRegion");
      setCenter({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      initializeStores({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPermission("granted");
        setListMode("myLocation");
        setCenter(current);
        initializeStores(current);
      },
      () => {
        setPermission("denied");
        setListMode("defaultRegion");
        const fallback = { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng };
        setCenter(fallback);
        initializeStores(fallback);
      },
      { timeout: 8000 }
    );
  }, [initializeStores, setCenter, setListMode, setPermission]);

  const handleClickDefaultRegion = () => {
    const fallback = { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng };
    setListMode("defaultRegion");
    setCenter(fallback);
    markMapMoved(false);
    applyAllFilters(fallback, null);
  };

  const handleClickMyLocation = async () => {
    const result = await checkPermissionAndRequestMyLocation();
    if (result === "needModal") {
      openPermissionModal();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPermission("granted");
        setListMode("myLocation");
        setCenter(current);
        markMapMoved(false);
        applyAllFilters(current, null);
      },
      () => {
        setPermission("denied");
        openPermissionModal();
      },
      { timeout: 8000 }
    );
  };

  const handleAllowFromModal = async () => {
    closePermissionModal();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPermission("granted");
        setListMode("myLocation");
        setCenter(current);
        markMapMoved(false);
        applyAllFilters(current, null);
      },
      () => {
        setPermission("denied");
      }
    );
  };

  const handleManualSearchFromModal = () => {
    closePermissionModal();
    handleClickDefaultRegion();
  };

  const handleMapIdle = (payload: {
    center: { lat: number; lng: number };
    bounds: { swLat: number; swLng: number; neLat: number; neLng: number };
  }) => {
    setCenter(payload.center);
    setBounds(payload.bounds);
    markMapMoved(true);
  };

  const handleSearchThisArea = () => {
    const origin = listMode === "myLocation" ? center : { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng };
    if (bounds) {
      filterByBounds(bounds, origin);
      markMapMoved(false);
    }
  };

  return (
    <main className="relative mx-auto h-screen max-w-md overflow-hidden bg-bg-canvas">
      <section className="absolute left-0 right-0 top-0 z-base px-4 pb-2 pt-12">
        <SearchControls
          permission={permission}
          listMode={listMode}
          query={query}
          selectedFilters={selectedFilters}
          onClickDefaultRegion={handleClickDefaultRegion}
          onClickMyLocation={handleClickMyLocation}
          onQueryChange={(nextQuery) => setQuery(nextQuery, center)}
          onToggleFilter={(filter) => toggleFilter(filter, center)}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Link
            href="/stores"
            className="rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-body-sm text-text-secondary shadow-elevation-1"
          >
            목록
          </Link>
          <Link href="/report" className="rounded-xl bg-brand-500 px-3 py-2 text-body-sm text-text-inverse shadow-elevation-2">
            제보하기
          </Link>
        </div>
      </section>

      <div className="h-full pt-0">
        <KakaoMapSection center={center} stores={visibleStores} onMapIdle={handleMapIdle} />
      </div>

      {mapMoved ? (
        <div className="pointer-events-none absolute inset-x-0 top-36 z-sheet flex justify-center">
          <button
            type="button"
            onClick={handleSearchThisArea}
            className="pointer-events-auto rounded-full bg-brand-500 px-4 py-2 text-body-sm font-medium text-text-inverse shadow-elevation-2"
          >
            이 지역에서 검색
          </button>
        </div>
      ) : null}

      <BottomSheet
        header={
          <div className="flex items-center justify-between">
            <p className="text-body-lg font-semibold text-text-primary">주변 판매처</p>
            <Link href="/edit-request" className="text-body-sm text-text-brand">
              정보 수정 요청
            </Link>
          </div>
        }
      >
        {contentState === "empty" ? (
          <div className="px-4 py-12 text-center">
            <p className="text-body-lg font-semibold text-text-primary">선택한 조건의 판매처가 없습니다.</p>
            <p className="mt-1 text-body-sm text-text-tertiary">제보해주시면 확인 후 업데이트됩니다.</p>
            <Link href="/report" className="mt-4 inline-block rounded-xl bg-brand-500 px-4 py-2 text-body-sm text-text-inverse">
              제보하기
            </Link>
          </div>
        ) : (
          <ul className="space-y-2 px-2">
            {visibleStores.map((store) => (
              <li key={store.id}>
                <StoreCard store={store} compact />
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>

      <PermissionModal
        open={permissionModalOpen}
        onAllow={handleAllowFromModal}
        onManualSearch={handleManualSearchFromModal}
      />
    </main>
  );
}
