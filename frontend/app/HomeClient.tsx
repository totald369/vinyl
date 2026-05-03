"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomSheetList from "@/components/BottomSheetList";
import HomeMapStage from "@/components/home/HomeMapStage";
import type { StoreListFilter } from "@/hooks/useStores";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import { DEEPLINK_SHORT_STORAGE_KEY, isValidShortCode } from "@/lib/shortLink";
import { DEFAULT_REGION } from "@/lib/types";
import { useDeepLinkResolver } from "@/hooks/useDeepLinkResolver";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { useMapCenterController } from "@/hooks/useMapCenterController";
import { useStoreDetailAugment } from "@/hooks/useStoreDetailAugment";
import { useSheetController } from "@/hooks/useSheetController";
import { StoreData, useStores } from "@/hooks/useStores";
import { useUserLocation } from "@/hooks/useUserLocation";
import { prefetchStoreDetail } from "@/lib/storeDetailClient";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";

/*
 * [항목 8·성능] 상태: useSheetController / useMapCenterController / useDeepLinkResolver 분리,
 * 지도 영역: memo된 HomeMapStage — 부모 리렌더와 지도 커밋 경계 분리.
 * [LCP] 조건부 UI는 dynamic import로 초기 번들에서 분리.
 */
const HomeSearchOverlay = dynamic(() => import("@/components/HomeSearchOverlay"), { ssr: false });
const StoreDetailSheet = dynamic(() => import("@/components/StoreDetailSheet"), { ssr: false });
const LocationPermissionModal = dynamic(() => import("@/components/LocationPermissionModal"), { ssr: false });
const LayoutShiftObserver = dynamic(() => import("@/components/LayoutShiftObserver"), { ssr: false });
const DETAIL_OPEN_PERF_LABEL = "[perf] detail-open";

export type HomeClientProps = {
  /** Server entry from `/s/{shortCode}` when the URL has no `?s=` query. */
  initialShortCode?: string | null;
};

export default function HomeClient({ initialShortCode = null }: HomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, error } = useKakaoMapLoader();
  const { userLocation, permission, requestLocation } = useUserLocation();
  const {
    locationModalOpen,
    setLocationModalOpen,
    bottomSheetSnap,
    setBottomSheetSnap,
    sheetBlocksMapPointer,
    setSheetBlocksMapPointer,
    sheetView,
    setSheetView,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery
  } = useSheetController();
  const [activeFilter, setActiveFilter] = useState<StoreListFilter>("payBag");
  const {
    exploreAnchor,
    setExploreAnchor,
    mapCenterOverride,
    setMapCenterOverride
  } = useMapCenterController();
  const detailOpenInFlightRef = useRef(false);
  const keepSelectedOutsideListRef = useRef(false);
  const handleSelectStoreWithPanRef = useRef<(store: StoreData, fromShort?: boolean) => void>(
    () => undefined
  );

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

  /** Deep-link fetch must not abort when `stores` change (list refetch after exploreAnchor). */
  const storesRef = useRef(stores);
  storesRef.current = stores;

  const detailAugmenting = useStoreDetailAugment(
    sheetView,
    selectedStore,
    center,
    setSelectedStore
  );

  const onPrefetchStore = useCallback(
    (store: StoreData) => prefetchStoreDetail(store.id, center),
    [center]
  );

  const handleFilterChange = useCallback((filter: StoreListFilter) => {
    sendGtagEvent("filter_select", { filter });
    setActiveFilter(filter);
  }, []);

  /* [INP 최적화] useCallback으로 핸들러 참조 안정화 → 자식 memo 이점 + 불필요 리렌더 방지 */
  const handleMapMarkerSelect = useCallback((store: StoreData) => {
    perfTimeStart(DETAIL_OPEN_PERF_LABEL);
    detailOpenInFlightRef.current = true;
    keepSelectedOutsideListRef.current = false;
    const resolved = storesById.get(store.id) ?? store;
    sendGtagEvent("click_marker", { store_id: resolved.id });
    setSelectedStore(resolved);
    setSheetView("detail");
  }, [storesById, setSelectedStore, setSheetView]);

  const handleSelectStoreWithPan = useCallback(
    (store: StoreData, fromShortLink = false) => {
      perfTimeStart(DETAIL_OPEN_PERF_LABEL);
      detailOpenInFlightRef.current = true;
      keepSelectedOutsideListRef.current = fromShortLink;
      const resolved = storesById.get(store.id) ?? store;
      const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
      setSelectedStore(resolved);
      setManualCenter(pos);
      setMapCenterOverride(pos);
      setCenterVersion((v) => v + 1);
      setSheetView("detail");
      // Short/deep links: desktop often has no GPS, so list ref stays null — still set anchor so
      // useStores refetches ~2km around the target store (otherwise selection can break after reload).
      if (fromShortLink) {
        setExploreAnchor(pos);
      } else {
        setExploreAnchor((prev) => (prev != null ? pos : prev));
      }
    },
    [
      storesById,
      setSelectedStore,
      setSheetView,
      setManualCenter,
      setMapCenterOverride,
      setCenterVersion,
      setExploreAnchor
    ]
  );

  handleSelectStoreWithPanRef.current = handleSelectStoreWithPan;

  const { deepLinkResolveError, dismissDeepLinkError } = useDeepLinkResolver({
    router,
    searchParams,
    initialShortCode,
    loading,
    selectedStore,
    sheetView,
    setSheetView,
    storesRef,
    handlePanRef: handleSelectStoreWithPanRef
  });

  const handleSearchSelectStore = useCallback((store: StoreData) => {
    perfTimeStart(DETAIL_OPEN_PERF_LABEL);
    detailOpenInFlightRef.current = true;
    keepSelectedOutsideListRef.current = false;
    const resolved = storesById.get(store.id) ?? store;
    const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
    setSelectedStore(resolved);
    setManualCenter(pos);
    setMapCenterOverride(pos);
    setExploreAnchor(pos);
    setCenterVersion((v) => v + 1);
    setSheetView("detail");
    setSearchOpen(false);
  }, [
    storesById,
    setSelectedStore,
    setSearchOpen,
    setSheetView,
    setManualCenter,
    setMapCenterOverride,
    setExploreAnchor,
    setCenterVersion
  ]);

  useEffect(() => {
    if (!detailOpenInFlightRef.current) return;
    if (sheetView === "detail" && selectedStore) {
      // [perf] detail open end: first render state with selected store + detail sheet
      perfTimeEnd(DETAIL_OPEN_PERF_LABEL);
      detailOpenInFlightRef.current = false;
    }
  }, [sheetView, selectedStore]);

  const handleMoveToLocation = useCallback(() => {
    keepSelectedOutsideListRef.current = false;
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
  }, [
    permission,
    userLocation,
    setSelectedStore,
    setLocationModalOpen,
    setSheetView,
    setExploreAnchor,
    setMapCenterOverride
  ]);

  const handleLocationPermissionAllow = useCallback(() => {
    setLocationModalOpen(false);
    requestLocation();
  }, [requestLocation, setLocationModalOpen]);

  const handleCloseDetail = useCallback(() => {
    keepSelectedOutsideListRef.current = false;
    setSheetView("list");
    const s = searchParams.get("s")?.trim() ?? "";
    if (isValidShortCode(s)) {
      try {
        sessionStorage.removeItem(DEEPLINK_SHORT_STORAGE_KEY);
      } catch {
        /* private mode */
      }
      router.replace("/", { scroll: false });
    }
  }, [router, searchParams, setSheetView]);
  const handleOpenSearch = useCallback(() => setSearchOpen(true), [setSearchOpen]);
  const handleCloseSearch = useCallback(() => setSearchOpen(false), [setSearchOpen]);
  const handleCloseLocationModal = useCallback(() => setLocationModalOpen(false), [setLocationModalOpen]);

  useEffect(() => {
    if (permission === "granted" && userLocation && !mapCenterOverride) {
      setManualCenter(userLocation);
      setCenterVersion((v) => v + 1);
    }
  }, [permission, userLocation, mapCenterOverride]);

  useEffect(() => {
    if (!selectedStore) return;
    const exists = stores.some((store) => store.id === selectedStore.id);
    if (!exists && !keepSelectedOutsideListRef.current) {
      setSelectedStore(null);
    }
  }, [selectedStore, setSelectedStore, stores]);

  useEffect(() => {
    if (!selectedStore) {
      setSheetView("list");
    }
  }, [selectedStore, setSheetView]);

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
      {deepLinkResolveError ? (
        <div className="pointer-events-auto absolute inset-x-0 top-[calc(8px+env(safe-area-inset-top,0px))] z-[45] px-[15px]">
          <div className="rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 shadow-elevation-2">
            <p className="text-body-sm text-danger-700">{deepLinkResolveError}</p>
            <button
              type="button"
              onClick={dismissDeepLinkError}
              className="mt-3 w-full rounded-lg bg-[#171717] py-2.5 text-center text-[15px] font-bold text-[#d4fe1c] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {"\uD648\uC73C\uB85C"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="fixed inset-y-0 left-0 right-0 z-0 flex h-[100dvh] justify-center">
        <div className="relative h-full min-h-0 w-full max-w-md">
          <div
            className={`absolute inset-0 z-0 ${sheetBlocksMapPointer ? "pointer-events-none" : ""}`}
          >
            <HomeMapStage
              kakaoLoading={isLoading}
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

          <section className="pointer-events-none absolute left-[15px] right-[15px] top-[calc(16px+env(safe-area-inset-top,0px))] z-sheet flex flex-col gap-2">
            <div className="pointer-events-auto flex w-full gap-2">
              <button
                type="button"
                onClick={handleOpenSearch}
                className="flex h-12 min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-white px-4 py-2 text-left shadow-[0px_0px_1px_rgba(0,0,0,0.08),0px_4px_6px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <img src="/Img/Icon/search_24.svg" alt="" width={24} height={24} className="shrink-0" />
                <span className="flex h-full min-w-0 flex-1 items-center text-[16px] font-normal leading-normal tracking-[-0.3px] text-[#999999]">
                  주소나 업체명을 검색해주세요
                </span>
              </button>
              <Link
                href="/regions"
                prefetch={false}
                className="flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] bg-[#171717] px-4 py-2 text-[16px] font-semibold leading-normal tracking-[-0.3px] text-[#d4fe1c] shadow-[0px_0px_1px_rgba(0,0,0,0.08),0px_4px_6px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                지역으로 보기
              </Link>
            </div>
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
              className="absolute bottom-[43vh] right-[15px] z-[35] flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] pointer-events-auto"
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
              isAugmentingDetail={detailAugmenting}
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
              onPrefetchStore={onPrefetchStore}
            />
          )}
        </div>
      </div>
    </main>
  );
}
