"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HomeMapStage from "@/components/home/HomeMapStage";
import LocationRequestingOverlay from "@/components/LocationRequestingOverlay";
import type { StoreListFilter } from "@/hooks/useStores";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import { DEEPLINK_SHORT_STORAGE_KEY, isValidShortCode } from "@/lib/shortLinkCore";
import { useDeepLinkResolver } from "@/hooks/useDeepLinkResolver";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { useMapCenterController } from "@/hooks/useMapCenterController";
import { useStoreDetailAugment } from "@/hooks/useStoreDetailAugment";
import { useSheetController } from "@/hooks/useSheetController";
import { StoreData, useStores } from "@/hooks/useStores";
import { useDeferMapMarkersAfterList } from "@/hooks/useDeferMapMarkersAfterList";
import { useUserLocation } from "@/hooks/useUserLocation";
import { prefetchStoreDetail } from "@/lib/storeDetailClient";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";

/*
 * [항목 8·성능] 상태: useSheetController / useMapCenterController / useDeepLinkResolver 분리,
 * 지도 영역: memo된 HomeMapStage — 부모 리렌더와 지도 커밋 경계 분리.
 * [LCP] 조건부 UI는 dynamic import로 초기 번들에서 분리.
 */
const BottomSheetList = dynamic(() => import("@/components/BottomSheetList"), {
  ssr: false,
  loading: () => null
});
const HomeSearchOverlay = dynamic(() => import("@/components/HomeSearchOverlay"), { ssr: false });
const StoreDetailSheet = dynamic(() => import("@/components/StoreDetailSheet"), { ssr: false });
const LocationPermissionModal = dynamic(() => import("@/components/LocationPermissionModal"), { ssr: false });
const LayoutShiftObserver = dynamic(() => import("@/components/LayoutShiftObserver"), { ssr: false });
const DETAIL_OPEN_PERF_LABEL = "[perf] detail-open";

export type HomeClientProps = {
  /** Server entry from `/s/{shortCode}` when the URL has no `?s=` query. */
  initialShortCode?: string | null;
  /**
   * 서버에서 미리 가져온 DEFAULT_REGION 기준 초기 매장 목록.
   * 변경 전: 빈 배열로 시작 → /api/stores 응답 전까지 마커/리스트 비어있음.
   * 변경 후: 첫 페인트에 즉시 표시 → 빈 화면 지속 시간 단축.
   */
  initialStores?: StoreData[];
};

export default function HomeClient({
  initialShortCode = null,
  initialStores
}: HomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** layout preload + maps.load 즉시 — 지도 타일이 LCP 이므로 idle 지연 제거 */
  const { isLoading, error } = useKakaoMapLoader();
  const { userLocation, permission, geolocationBlocked, requestLocation, syncBrowserPermission } =
    useUserLocation();
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
  /**
   * permission === "requesting" 일 때 즉시 칩을 띄우면 첫 응답이 매우 빠를 때 깜빡임 — 200ms 후 표시.
   */
  const [showGeoProgressUi, setShowGeoProgressUi] = useState(false);
  const {
    exploreAnchor,
    setExploreAnchor,
    mapCenterOverride,
    setMapCenterOverride
  } = useMapCenterController();
  const detailOpenInFlightRef = useRef(false);
  const keepSelectedOutsideListRef = useRef(false);
  /** granted 자동 센터링은 최초 1회만 — 이후 GPS 갱신·수동 이동을 덮어쓰지 않음 */
  const autoCenteredOnGrantRef = useRef(false);
  const handleSelectStoreWithPanRef = useRef<(store: StoreData, fromShort?: boolean) => void>(
    () => undefined
  );

  const {
    selectedStore,
    setSelectedStore,
    sortedStores,
    stores,
    loading,
    searchTotal,
    searchHasMore,
    searchLoadingMore,
    loadMoreSearchStores
  } = useStores(userLocation, {
    activeFilter,
    listReference: exploreAnchor,
    searchQuery: searchOpen ? searchQuery : "",
    initialStores
  });

  const searchOverlayResults = useMemo(() => {
    if (!searchQuery.trim() || loading) return [];
    return stores;
  }, [loading, searchQuery, stores]);

  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const [manualCenter, setManualCenter] = useState<LatLng>(DEFAULT_REGION);
  const [centerVersion, setCenterVersion] = useState(0);
  const sortedStoreIdSet = useMemo(() => new Set(sortedStores.map((s) => s.id)), [sortedStores]);
  const mapStores = useMemo(() => {
    if (!selectedStore) return sortedStores;
    if (sortedStoreIdSet.has(selectedStore.id)) return sortedStores;
    // 원거리 검색 결과도 맵에서 선택 상태를 유지할 수 있게 selectedStore를 합쳐 렌더
    return [selectedStore, ...sortedStores];
  }, [selectedStore, sortedStores, sortedStoreIdSet]);

  const center = useMemo(() => {
    if (mapCenterOverride) return mapCenterOverride;
    if (permission === "granted" && userLocation) return userLocation;
    return manualCenter;
  }, [manualCenter, mapCenterOverride, permission, userLocation]);
  const centerLat = center.lat;
  const centerLng = center.lng;

  const listReady = !loading && sortedStores.length > 0;
  const mapMarkerResetKey = `${centerLat.toFixed(4)},${centerLng.toFixed(4)}:${activeFilter}:${sortedStores.length}`;
  const showMapMarkers = useDeferMapMarkersAfterList({
    listReady,
    resetKey: mapMarkerResetKey
  });
  const mapStoresForView = showMapMarkers ? mapStores : [];

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
    (store: StoreData) =>
      prefetchStoreDetail(store.id, { lat: centerLat, lng: centerLng }),
    [centerLat, centerLng]
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

  /**
   * StoreDetailSheet 는 `dynamic(...)` 으로 코드 분할되어 첫 마커 클릭 시 청크 다운로드가
   * 메인 스레드/네트워크와 경합 → 첫 시트 표시가 느림.
   * 변경 후: 메인 hydration 직후 idle 시점에 청크를 미리 import 해 캐시에 적재.
   *         이후 마커 클릭은 클릭→렌더 사이에 다운로드 단계가 사라짐.
   * 측정: 첫 marker click → 시트 첫 페인트(`[perf] detail-open`).
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idle: (cb: () => void) => number =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
      ((cb) => window.setTimeout(cb, 1));
    const cancel: (id: number) => void =
      (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback ??
      ((id) => window.clearTimeout(id));
    const handle = idle(() => {
      void import("@/components/StoreDetailSheet");
    });
    return () => cancel(handle);
  }, []);

  const panMapToUserLocation = useCallback(() => {
    setSelectedStore(null);
    setSheetView("list");
    setExploreAnchor(null);
    setMapCenterOverride(null);
    if (userLocation) {
      setManualCenter(userLocation);
    }
    setCenterVersion((v) => v + 1);
  }, [
    userLocation,
    setSelectedStore,
    setSheetView,
    setExploreAnchor,
    setMapCenterOverride
  ]);

  const handleMoveToLocation = useCallback(() => {
    keepSelectedOutsideListRef.current = false;
    sendGtagEvent("click_my_location");
    panMapToUserLocation();
    if (permission === "granted") {
      requestLocation({ silent: !!userLocation });
      return;
    }
    requestLocation();
    setLocationModalOpen(true);
  }, [
    permission,
    panMapToUserLocation,
    requestLocation,
    setLocationModalOpen,
    userLocation
  ]);

  /**
   * 변경 전: 모달 grant 직후 requestLocation 만 호출 → 위치 권한 grant 가 일어나면
   *          useEffect[permission, userLocation, mapCenterOverride] 가 manualCenter 를 갱신해야 하는데,
   *          마커 detail/검색 결과 선택 등으로 mapCenterOverride/exploreAnchor 가 살아 있으면
   *          `!mapCenterOverride` 가드에 막혀 center 가 그대로 → 사용자 보고: "허용해도 이동 안 함".
   * 변경 후: grant 직전에 명시적으로 selectedStore/sheetView/exploreAnchor/mapCenterOverride 를 reset.
   *          - userLocation 이 비동기로 들어오면 useEffect 가 setManualCenter + centerVersion++ 실행.
   *          - 이미 위치를 가지고 있다면 즉시 manualCenter 도 동기로 이동시켜 lazy mount /
   *            geolocation 응답 지연 사이의 갭에서도 사용자가 곧바로 위치 변경을 체감.
   *          UI/상호작용 동일 (모달은 사용자가 명시적으로 띄운 상태이므로 reset 이 의도와 일치).
   */
  const handleLocationPermissionAllow = useCallback(() => {
    setLocationModalOpen(false);
    keepSelectedOutsideListRef.current = false;
    panMapToUserLocation();
    void syncBrowserPermission();
    requestLocation();
  }, [panMapToUserLocation, requestLocation, setLocationModalOpen, syncBrowserPermission]);

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
    if (permission !== "requesting") {
      setShowGeoProgressUi(false);
      return;
    }
    const t = window.setTimeout(() => setShowGeoProgressUi(true), 200);
    return () => window.clearTimeout(t);
  }, [permission]);

  useEffect(() => {
    if (permission !== "granted" || !userLocation || mapCenterOverride || autoCenteredOnGrantRef.current) {
      return;
    }
    autoCenteredOnGrantRef.current = true;
    setManualCenter(userLocation);
    setCenterVersion((v) => v + 1);
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
      <LocationRequestingOverlay visible={showGeoProgressUi} />
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
              /**
               * 변경 전: `loading ? [] : mapStores` 로 백그라운드 갱신 중에도 마커를 빈 배열로 강제 →
               *         새로고침 직후 SSR 데이터가 보이다가 두 번째 fetch 가 시작되면 마커 일제히 사라짐.
               * 변경 후: SWR 패턴 — loading 중에도 이전 데이터 유지(실제 비어있을 때만 자연스럽게 [])
               *         → 새로고침 시 깜빡임 제거.
               */
              stores={mapStoresForView}
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
                <img
                  src="/Img/Icon/search_24.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="shrink-0"
                  fetchPriority="low"
                />
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
              prefetch={false}
              onClick={() => sendGtagEvent("click_report")}
              className="absolute bottom-[43vh] right-[15px] z-[35] flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] pointer-events-auto"
            >
              <img src="/Img/Icon/write_24.svg" alt="" width={24} height={24} className="shrink-0" />
              <span>제보하기</span>
            </Link>
          ) : null}

          <LocationPermissionModal
            open={locationModalOpen}
            blocked={geolocationBlocked}
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

          {/**
           * [INP] 변경 전: `sheetView === "detail"` 토글마다 BottomSheetList unmount(60+ DOM 제거,
           *   virtualizer/IntersectionObserver/PointerEvent listener cleanup) + StoreDetailSheet
           *   mount(첫 render + useEffect 체인)가 클릭 next-paint 안에 동시에 들어가 INP 폭증.
           * 변경 후: 둘 다 항상 mount 하고 visibility 만 토글.
           *   - BottomSheetList: 항상 mount, detail 모드일 때 invisible + pointer-events-none.
           *   - StoreDetailSheet: selectedStore 가 한 번이라도 set 되면 mount, sheetView !== "detail"
           *     일 때 invisible + pointer-events-none.
           *   - UI 동작/외형 동일 (사용자는 같은 시트가 같은 위치에 나타남).
           *   - 첫 마커 클릭 INP 만 detail 마운트 비용을 1회 가지지만, 이후 마커/리스트 클릭은
           *     prop 만 갱신 → INP 일관되게 짧음.
           */}
          <div
            className={sheetView === "detail" ? "pointer-events-none invisible" : ""}
            aria-hidden={sheetView === "detail"}
          >
            <BottomSheetList
              /**
               * 변경 전: `loading ? [] : sortedStores` 로 백그라운드 갱신 중 리스트가 잠깐 비었다 다시 채워짐.
               * 변경 후: SWR — 실제 비어있을 때만 [] (sortedStores 자연 상태), loading 중 이전 데이터 유지.
               * `listLoading` 은 그대로 두어 컴포넌트가 빈 상태 placeholder 등 처리 가능.
               */
              stores={sortedStores}
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
          </div>

          {selectedStore ? (
            <div
              className={sheetView !== "detail" ? "pointer-events-none invisible" : ""}
              aria-hidden={sheetView !== "detail"}
            >
              <StoreDetailSheet
                store={selectedStore}
                onClose={handleCloseDetail}
                userLocation={permission === "granted" && userLocation ? userLocation : null}
                kakaoMapsReady={!isLoading && !error}
                isAugmentingDetail={detailAugmenting}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
