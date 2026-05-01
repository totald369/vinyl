"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BottomSheetList from "@/components/BottomSheetList";
import MapSkeleton from "@/components/MapSkeleton";
import type { StoreListFilter } from "@/hooks/useStores";
import type { BottomSheetSnap } from "@/lib/bottomSheetSnap";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import {
  DEEPLINK_LOG_PREFIX,
  fetchStoreByShortCodeOnly
} from "@/lib/deepLinkShortResolve";
import { DEEPLINK_SHORT_STORAGE_KEY, isValidShortCode } from "@/lib/shortLink";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { useStoreDetailAugment } from "@/hooks/useStoreDetailAugment";
import { StoreData, useStores } from "@/hooks/useStores";
import { useUserLocation } from "@/hooks/useUserLocation";
import { prefetchStoreDetail } from "@/lib/storeDetailClient";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";

/*
 * [LCP 최적화] 조건부로만 표시되는 무거운 컴포넌트를 dynamic import로 분리.
 * 초기 JS 번들에서 제외하여 파싱·실행 비용을 줄입니다.
 */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
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
  /** Keep detail when the store is outside the current `stores` list (e.g. /?s= deep link). */
  const keepSelectedOutsideListRef = useRef(false);
  /** Prevents duplicate `short` fetches; survives `loading` toggles (must not abort on list refetch). */
  const shortLinkFetchForRef = useRef<string | null>(null);
  /** Detects new `?s=` navigation vs stable param (for reopen + user-override guard). */
  const lastSeenDeepLinkShortRef = useRef<string>("");
  const [deepLinkResolveError, setDeepLinkResolveError] = useState<string | null>(null);
  const detailOpenInFlightRef = useRef(false);

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

  const sFromSearchParams = searchParams.get("s")?.trim() ?? "";
  /** Next `useSearchParams` can miss `s` on some desktop navigations; merge URL + prop + sessionStorage. */
  const [deepLinkShort, setDeepLinkShort] = useState(() => {
    const p = initialShortCode?.trim() ?? "";
    return isValidShortCode(p) ? p : "";
  });

  useLayoutEffect(() => {
    let code = sFromSearchParams;
    if (!isValidShortCode(code)) {
      const fromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("s")?.trim() ?? ""
          : "";
      if (isValidShortCode(fromUrl)) code = fromUrl;
    }
    if (!isValidShortCode(code)) {
      const fromProp = initialShortCode?.trim() ?? "";
      if (isValidShortCode(fromProp)) code = fromProp;
    }
    if (!isValidShortCode(code)) {
      try {
        const st = sessionStorage.getItem(DEEPLINK_SHORT_STORAGE_KEY)?.trim() ?? "";
        if (isValidShortCode(st)) code = st;
      } catch {
        /* private mode */
      }
    }
    if (!isValidShortCode(code)) {
      setDeepLinkShort("");
      return;
    }
    setDeepLinkShort(code);

    const onShareShortPath =
      typeof window !== "undefined" && /^\/s\/[a-zA-Z0-9]{6}$/.test(window.location.pathname);

    if (sFromSearchParams !== code && !onShareShortPath) {
      router.replace(`/?s=${encodeURIComponent(code)}`, { scroll: false });
    }
  }, [sFromSearchParams, router, initialShortCode]);

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
  }, [storesById, setSelectedStore]);

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
    [storesById, setSelectedStore]
  );

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
  }, [storesById, setSelectedStore]);

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
  }, [permission, userLocation, setSelectedStore]);

  const handleLocationPermissionAllow = useCallback(() => {
    setLocationModalOpen(false);
    requestLocation();
  }, [requestLocation]);

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
  }, [router, searchParams]);
  const handleOpenSearch = useCallback(() => setSearchOpen(true), []);
  const handleCloseSearch = useCallback(() => setSearchOpen(false), []);
  const handleCloseLocationModal = useCallback(() => setLocationModalOpen(false), []);

  const dismissDeepLinkError = useCallback(() => {
    setDeepLinkResolveError(null);
    const s = searchParams.get("s")?.trim() ?? "";
    if (isValidShortCode(s)) {
      try {
        sessionStorage.removeItem(DEEPLINK_SHORT_STORAGE_KEY);
      } catch {
        /* noop */
      }
      router.replace("/", { scroll: false });
    }
  }, [router, searchParams]);

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
  }, [selectedStore]);

  useEffect(() => {
    if (!isValidShortCode(deepLinkShort)) {
      lastSeenDeepLinkShortRef.current = "";
      setDeepLinkResolveError(null);
      return;
    }
    if (loading) return;

    console.info(DEEPLINK_LOG_PREFIX, "effect", {
      deepLinkShort,
      loading,
      selectedShort: selectedStore?.shortCode ?? null,
      sheetView
    });

    const shortParamChanged = lastSeenDeepLinkShortRef.current !== deepLinkShort;
    lastSeenDeepLinkShortRef.current = deepLinkShort;

    const clearDeepLinkStorage = () => {
      try {
        sessionStorage.removeItem(DEEPLINK_SHORT_STORAGE_KEY);
      } catch {
        /* noop */
      }
    };

    /*
     * Same store as URL: only bail if already on detail. If user came back to list, reopen detail
     * when `?s=` just appeared again (shortParamChanged); otherwise keep list (e.g. tapped "목록으로").
     */
    if (selectedStore?.shortCode === deepLinkShort) {
      setDeepLinkResolveError(null);
      if (sheetView === "detail") return;
      if (shortParamChanged) {
        console.info(DEEPLINK_LOG_PREFIX, "reopen detail (same store, param changed)");
        setSheetView("detail");
      }
      return;
    }

    /*
     * User chose another store on the map while stale `?s=` remains — do not fight them.
     * If `?s=` changed to a new code (new share link), always resolve.
     */
    if (
      !shortParamChanged &&
      selectedStore != null &&
      isValidShortCode(selectedStore.shortCode) &&
      selectedStore.shortCode !== deepLinkShort
    ) {
      console.info(DEEPLINK_LOG_PREFIX, "skip: user selected different store, stale ?s=");
      return;
    }

    const list = storesRef.current;
    const fromList = list.find((s) => s.shortCode === deepLinkShort);
    console.info(DEEPLINK_LOG_PREFIX, "fromList", { found: Boolean(fromList), listLen: list.length });

    if (fromList) {
      shortLinkFetchForRef.current = null;
      setDeepLinkResolveError(null);
      handleSelectStoreWithPan({ ...fromList, shortCode: deepLinkShort }, true);
      clearDeepLinkStorage();
      return;
    }

    const code = deepLinkShort;
    if (shortLinkFetchForRef.current === code) {
      console.info(DEEPLINK_LOG_PREFIX, "skip fetch: already in flight", code);
      return;
    }
    shortLinkFetchForRef.current = code;

    void (async () => {
      try {
        const { row, requestUrl, httpOk, httpStatus } = await fetchStoreByShortCodeOnly(code);
        if (shortLinkFetchForRef.current !== code) {
          console.info(DEEPLINK_LOG_PREFIX, "stale response ignored", { code });
          return;
        }
        if (!httpOk) {
          console.error(DEEPLINK_LOG_PREFIX, "fallback: API failed", { code, requestUrl, httpStatus });
          setDeepLinkResolveError(
            "\uC5C5\uCCB4 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."
          );
          clearDeepLinkStorage();
          return;
        }
        if (row) {
          setDeepLinkResolveError(null);
          handleSelectStoreWithPan({ ...row, shortCode: code }, true);
          clearDeepLinkStorage();
          console.info(DEEPLINK_LOG_PREFIX, "resolved via API", { code, id: row.id });
          return;
        }
        console.error(DEEPLINK_LOG_PREFIX, "fallback: empty stores[] for shortCode", {
          code,
          requestUrl
        });
        setDeepLinkResolveError(
          "\uD574\uB2F9 \uC5C5\uCCB4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
        );
        clearDeepLinkStorage();
      } catch (e) {
        console.error(DEEPLINK_LOG_PREFIX, "unexpected error", e);
        setDeepLinkResolveError(
          "\uC5C5\uCCB4 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
        );
        clearDeepLinkStorage();
      } finally {
        if (shortLinkFetchForRef.current === code) {
          shortLinkFetchForRef.current = null;
        }
      }
    })();
  }, [deepLinkShort, loading, selectedStore?.shortCode, sheetView, handleSelectStoreWithPan]);

  /** In-app browsers often reuse the same `/?s=` URL; second open does not remount — reopen detail on focus. */
  useEffect(() => {
    const tryReopenFromUrl = () => {
      if (typeof window === "undefined") return;
      const raw = new URLSearchParams(window.location.search).get("s")?.trim() ?? "";
      if (!isValidShortCode(raw)) return;
      if (sheetView !== "list") return;
      const sel = selectedStore;
      if (!sel || sel.shortCode !== raw) return;
      setSheetView("detail");
    };

    const onVis = () => {
      if (document.visibilityState === "visible") tryReopenFromUrl();
    };
    window.addEventListener("pageshow", tryReopenFromUrl);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", tryReopenFromUrl);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedStore, sheetView]);

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
