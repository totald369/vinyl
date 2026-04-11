"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BottomSheetList from "@/components/BottomSheetList";
import MapSkeleton from "@/components/MapSkeleton";
import type { StoreListFilter } from "@/hooks/useStores";
import type { BottomSheetSnap } from "@/lib/bottomSheetSnap";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { StoreData, useStores } from "@/hooks/useStores";
import { useUserLocation } from "@/hooks/useUserLocation";

/*
 * [LCP 최적화] 조건부로만 표시되는 무거운 컴포넌트를 dynamic import로 분리.
 * 초기 JS 번들에서 제외하여 파싱·실행 비용을 줄입니다.
 */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const HomeSearchOverlay = dynamic(() => import("@/components/HomeSearchOverlay"), { ssr: false });
const StoreDetailSheet = dynamic(() => import("@/components/StoreDetailSheet"), { ssr: false });
const LocationPermissionModal = dynamic(() => import("@/components/LocationPermissionModal"), { ssr: false });
const LayoutShiftObserver = dynamic(() => import("@/components/LayoutShiftObserver"), { ssr: false });

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

  /* [INP 최적화] useCallback으로 핸들러 참조 안정화 → 자식 memo 이점 + 불필요 리렌더 방지 */
  const handleMapMarkerSelect = useCallback((store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    sendGtagEvent("click_marker", { store_id: resolved.id });
    setSelectedStore(resolved);
    setSheetView("detail");
  }, [storesById, setSelectedStore]);

  const handleSelectStoreWithPan = useCallback((store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
    setSelectedStore(resolved);
    setManualCenter(pos);
    setMapCenterOverride(pos);
    setCenterVersion((v) => v + 1);
    setSheetView("detail");
    setExploreAnchor((prev) => (prev != null ? pos : prev));
  }, [storesById, setSelectedStore]);

  const handleSearchSelectStore = useCallback((store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
    setSelectedStore(resolved);
    setManualCenter(pos);
    setMapCenterOverride(pos);
    setExploreAnchor(pos);
    setCenterVersion((v) => v + 1);
    setSheetView("detail");
    setSearchOpen(false);
  }, [storesById, setSelectedStore]);

  const handleMoveToLocation = useCallback(() => {
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
  }, [permission, userLocation, setSelectedStore]);

  const handleLocationPermissionAllow = useCallback(() => {
    setLocationModalOpen(false);
    requestLocation();
  }, [requestLocation]);

  const handleCloseDetail = useCallback(() => setSheetView("list"), []);
  const handleOpenSearch = useCallback(() => setSearchOpen(true), []);
  const handleCloseSearch = useCallback(() => setSearchOpen(false), []);
  const handleCloseLocationModal = useCallback(() => setLocationModalOpen(false), []);

  useEffect(() => {
    if (permission === "granted" && userLocation && !mapCenterOverride) {
      setManualCenter(userLocation);
      setCenterVersion((v) => v + 1);
    }
  }, [permission, userLocation, mapCenterOverride]);

  useEffect(() => {
    if (!selectedStore) return;
    const exists = stores.some((store) => store.id === selectedStore.id);
    if (!exists) {
      setSelectedStore(null);
    }
  }, [selectedStore, setSelectedStore, stores]);

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
    <main className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-bg-canvas">
      <LayoutShiftObserver />
      <div className="fixed inset-y-0 left-0 right-0 z-0 flex h-[100dvh] justify-center">
        <div className="relative h-full min-h-0 w-full max-w-md">
          <div
            className={`absolute inset-0 z-0 ${sheetBlocksMapPointer ? "pointer-events-none" : ""}`}
          >
            {isLoading ? (
              <MapSkeleton />
            ) : (
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
            )}
          </div>

          <section className="pointer-events-none absolute left-[15px] right-[15px] top-[calc(16px+env(safe-area-inset-top,0px))] z-sheet flex flex-col gap-2">
            <button
              type="button"
              onClick={handleOpenSearch}
              className="pointer-events-auto flex h-12 w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-white px-4 py-2 text-left shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <img src="/Img/Icon/search_24.svg" alt="" width={24} height={24} className="shrink-0" />
              <span className="flex h-full min-w-0 flex-1 items-center text-[16px] font-normal leading-normal tracking-[-0.3px] text-[#999999]">
                주소나 업체명을 검색해주세요
              </span>
            </button>
            <p className="pointer-events-auto rounded-[8px] bg-white/90 px-3 py-1.5 text-center text-[10px] leading-snug text-[#444444] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.06)]">
              <span className="font-semibold text-[#171717]">종량제봉투</span>·
              <span className="font-semibold text-[#171717]">불연성마대</span>·
              <span className="font-semibold text-[#171717]">PP마대(건설마대)</span>·
              <span className="font-semibold text-[#171717]">폐기물 스티커</span> 위치·거리 검색
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleMoveToLocation}
                className="pointer-events-auto flex shrink-0 items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
              className="absolute bottom-[42vh] right-[15px] z-[35] flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] pointer-events-auto"
            >
              <img src="/Img/Icon/write_24.svg" alt="" width={24} height={24} className="shrink-0" />
              <span>제보하기</span>
            </Link>
          ) : null}

          <LocationPermissionModal
            open={locationModalOpen}
            onClose={handleCloseLocationModal}
            onAllow={handleLocationPermissionAllow}
          />

          <HomeSearchOverlay
            open={searchOpen}
            onClose={handleCloseSearch}
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
              onClose={handleCloseDetail}
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
              listLoading={loading}
            />
          )}
        </div>
      </div>
      <nav className="sr-only" aria-label="주요 안내 페이지">
        <a href="/stores">판매처 목록</a>
        {" · "}
        <a href="/gangnam">강남 종량제봉투 판매처 보기</a>
      </nav>
    </main>
  );
}
