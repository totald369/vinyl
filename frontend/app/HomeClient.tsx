"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BottomSheetList from "@/components/BottomSheetList";
import HomeSearchOverlay from "@/components/HomeSearchOverlay";
import LocationPermissionModal from "@/components/LocationPermissionModal";
import MapView from "@/components/MapView";
import StoreDetailSheet from "@/components/StoreDetailSheet";
import type { StoreListFilter } from "@/hooks/useStores";
import type { BottomSheetSnap } from "@/lib/bottomSheetSnap";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { StoreData, useStores } from "@/hooks/useStores";
import { useUserLocation } from "@/hooks/useUserLocation";

export default function HomeClient() {
  const { isLoading, error } = useKakaoMapLoader();
  const { userLocation, permission, requestLocation } = useUserLocation();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<StoreListFilter>("payBag");
  const [bottomSheetSnap, setBottomSheetSnap] = useState<BottomSheetSnap>("collapsed");
  const [sheetBlocksMapPointer, setSheetBlocksMapPointer] = useState(false);
  const [sheetView, setSheetView] = useState<"list" | "detail">("list");
  /** 검색으로 상점을 고른 뒤: 목록·지도 기준점을 해당 매장으로 두고 반경 2km(기존 LIST_RADIUS) 표시 */
  const [exploreAnchor, setExploreAnchor] = useState<LatLng | null>(null);
  /** 위치 권한이 있어도 검색/목록에서 선택한 지점으로 지도 중심 이동 */
  const [mapCenterOverride, setMapCenterOverride] = useState<LatLng | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    selectedStore,
    setSelectedStore,
    sortedStores,
    stores,
    defaultCenter,
    loading,
    searchTotal,
    searchHasMore,
    searchLoadingMore,
    loadMoreSearchStores
  } = useStores(userLocation, {
    activeFilter,
    listReference: exploreAnchor,
    searchQuery: searchOpen ? searchQuery : ""
  });

  const searchOverlayResults = useMemo(() => {
    if (!searchQuery.trim() || loading) return [];
    return stores;
  }, [loading, searchQuery, stores]);

  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const [manualCenter, setManualCenter] = useState(defaultCenter);
  const [centerVersion, setCenterVersion] = useState(0);
  const mapStores = useMemo(() => {
    if (!selectedStore) return sortedStores;
    const existsInMap = sortedStores.some((store) => store.id === selectedStore.id);
    if (existsInMap) return sortedStores;
    // 원거리 검색 결과도 맵에서 선택 상태를 유지할 수 있게 selectedStore를 합쳐 렌더
    return [selectedStore, ...sortedStores];
  }, [selectedStore, sortedStores]);
  const center = useMemo(
    () => mapCenterOverride ?? userLocation ?? manualCenter,
    [mapCenterOverride, manualCenter, userLocation]
  );

  const handleFilterChange = useCallback((filter: StoreListFilter) => {
    sendGtagEvent("filter_select", { filter });
    setActiveFilter(filter);
  }, []);

  const handleMapMarkerSelect = (store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    sendGtagEvent("click_marker", { store_id: resolved.id });
    setSelectedStore(resolved);
    setSheetView("detail");
  };

  const handleSelectStoreWithPan = (store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
    setSelectedStore(resolved);
    setManualCenter(pos);
    setMapCenterOverride(pos);
    setCenterVersion((v) => v + 1);
    setSheetView("detail");
    setExploreAnchor((prev) => (prev != null ? pos : prev));
  };

  const handleSearchSelectStore = (store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
    setSelectedStore(resolved);
    setManualCenter(pos);
    setMapCenterOverride(pos);
    setExploreAnchor(pos);
    setCenterVersion((v) => v + 1);
    setSheetView("detail");
    setSearchOpen(false);
  };

  const handleMoveToLocation = () => {
    sendGtagEvent("click_my_location");
    if (permission !== "granted") {
      setLocationModalOpen(true);
      return;
    }
    setSelectedStore(null);
    setSheetView("list");
    setExploreAnchor(null);
    setMapCenterOverride(null);
    if (userLocation) {
      setManualCenter(userLocation);
    } else {
      setManualCenter({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
    }
    setCenterVersion((v) => v + 1);
  };

  const handleLocationPermissionAllow = () => {
    setLocationModalOpen(false);
    requestLocation();
  };

  useEffect(() => {
    if (permission === "granted" && userLocation && !mapCenterOverride) {
      setManualCenter(userLocation);
      setCenterVersion((v) => v + 1);
    }
  }, [permission, userLocation, mapCenterOverride]);

  useEffect(() => {
    if (!selectedStore) return;
    // 상세 뷰는 현재 근거리 목록(sortedStores)이 아니라 전체 stores 기준으로 유지해야 함
    const exists = stores.some((store) => store.id === selectedStore.id);
    console.debug("[home/select-guard] selectedStore id:", selectedStore.id);
    console.debug("[home/select-guard] exists in full dataset:", exists);
    if (!exists) {
      setSelectedStore(null);
    }
  }, [selectedStore, setSelectedStore, stores]);

  useEffect(() => {
    if (!selectedStore) return;
    console.debug("[home/selected] selectedStore id:", selectedStore.id);
    console.debug("[home/selected] sheetView:", sheetView);
  }, [selectedStore, sheetView]);

  useEffect(() => {
    if (!selectedStore) {
      setSheetView("list");
    }
  }, [selectedStore]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-canvas px-4">
        <p className="rounded-xl bg-danger-50 px-4 py-3 text-body-sm text-danger-700">{error}</p>
      </main>
    );
  }

  return (
    <main className="relative mx-auto h-screen max-w-md overflow-hidden bg-bg-canvas">
      {isLoading ? (
        <div className="flex h-full items-center justify-center text-body-sm text-text-secondary">
          카카오 지도를 불러오는 중입니다...
        </div>
      ) : (
        <>
          <div className={`h-full w-full ${sheetBlocksMapPointer ? "pointer-events-none" : ""}`}>
            <MapView
              center={center}
              centerVersion={centerVersion}
              preferredMapLevel={exploreAnchor != null ? 6 : 5}
              stores={loading ? [] : mapStores}
              activeFilter={activeFilter}
              selectedStoreId={selectedStore?.id}
              onSelectStore={handleMapMarkerSelect}
              userMarkerPosition={permission === "granted" && userLocation ? userLocation : null}
            />
          </div>
          <section className="absolute left-[15px] right-[15px] top-[calc(16px+env(safe-area-inset-top,0px))] z-sheet flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-12 w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-white px-4 py-2 text-left shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <img src="/Img/Icon/search_24.svg" alt="" width={24} height={24} className="shrink-0" />
              <span className="flex h-full min-w-0 flex-1 items-center text-[16px] font-normal leading-normal tracking-[-0.3px] text-[#999999]">
                주소나 업체명을 검색해주세요
              </span>
            </button>
            <p className="rounded-[8px] bg-white/90 px-3 py-1.5 text-center text-[10px] leading-snug text-[#444444] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.06)]">
              <span className="font-semibold text-[#171717]">종량제봉투</span>·
              <span className="font-semibold text-[#171717]">불연성마대</span>·
              <span className="font-semibold text-[#171717]">PP마대(건설마대)</span>·
              <span className="font-semibold text-[#171717]">폐기물 스티커</span> 위치·거리 검색
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleMoveToLocation}
                className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="내 위치"
              >
                <img
                  src="/Img/Icon/my_location_88.svg"
                  alt=""
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px]"
                />
              </button>
            </div>
          </section>

          {SHOW_HOME_REPORT_BUTTON && bottomSheetSnap === "collapsed" && sheetView === "list" ? (
            <Link
              href="/report"
              onClick={() => sendGtagEvent("click_report")}
              className="absolute bottom-[36vh] right-[15px] z-[35] flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)]"
            >
              <img src="/Img/Icon/write_24.svg" alt="" width={24} height={24} className="shrink-0" />
              <span>제보하기</span>
            </Link>
          ) : null}

          <LocationPermissionModal
            open={locationModalOpen}
            onClose={() => setLocationModalOpen(false)}
            onAllow={handleLocationPermissionAllow}
          />

          <HomeSearchOverlay
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            activeFilter={activeFilter}
            onActiveFilterChange={handleFilterChange}
            totalMatchCount={searchTotal}
            loading={loading}
            results={searchOverlayResults}
            hasMoreResults={searchHasMore}
            loadingMoreResults={searchLoadingMore}
            onLoadMoreResults={loadMoreSearchStores}
            onSelectStore={handleSearchSelectStore}
          />

          {selectedStore && sheetView === "detail" ? (
            <StoreDetailSheet
              store={selectedStore}
              onClose={() => setSheetView("list")}
              userLocation={permission === "granted" && userLocation ? userLocation : null}
              kakaoMapsReady={!isLoading && !error}
            />
          ) : (
            <BottomSheetList
              stores={loading ? [] : sortedStores}
              selectedStoreId={selectedStore?.id}
              onSelectStore={handleSelectStoreWithPan}
              activeFilter={activeFilter}
              onChangeFilter={handleFilterChange}
              snap={bottomSheetSnap}
              onSnapChange={setBottomSheetSnap}
              onDragActiveChange={setSheetBlocksMapPointer}
            />
          )}
        </>
      )}
      <nav aria-label="주요 안내 페이지">
        <a href="/stores">판매처 목록</a>
        {" · "}
        <a href="/gangnam">강남 종량제봉투 판매처 보기</a>
      </nav>
    </main>
  );
}
