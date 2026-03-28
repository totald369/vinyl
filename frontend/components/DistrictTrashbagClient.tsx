"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BottomSheetList from "@/components/BottomSheetList";
import HomeSearchOverlay from "@/components/HomeSearchOverlay";
import LocationPermissionModal from "@/components/LocationPermissionModal";
import MapView from "@/components/MapView";
import StoreDetailSheet from "@/components/StoreDetailSheet";
import type { DistrictTrashbagConfig } from "@/lib/districtTrashbagSeo";
import type { StoreListFilter } from "@/hooks/useStores";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import { filterStoresForSearch } from "@/lib/storeSearch";
import type { LatLng } from "@/lib/types";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { StoreData, useStores } from "@/hooks/useStores";
import { useUserLocation } from "@/hooks/useUserLocation";

const SEARCH_LIST_BATCH = 100;

type Props = {
  config: DistrictTrashbagConfig;
};

export default function DistrictTrashbagClient({ config }: Props) {
  const { isLoading, error } = useKakaoMapLoader();
  const { userLocation, permission, requestLocation } = useUserLocation();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<StoreListFilter>("payBag");
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [sheetView, setSheetView] = useState<"list" | "detail">("list");
  const [exploreAnchor, setExploreAnchor] = useState<LatLng | null>(null);
  const [mapCenterOverride, setMapCenterOverride] = useState<LatLng | null>(null);

  const districtScope = useMemo(
    () => ({
      addressContains: config.addressKeyword,
      sortFrom: config.mapCenter,
      listRadiusKm: config.listRadiusKm ?? null
    }),
    [config.addressKeyword, config.listRadiusKm, config.mapCenter]
  );

  const { selectedStore, setSelectedStore, sortedStores, stores, loading } = useStores(
    userLocation,
    { activeFilter, listReference: exploreAnchor, districtScope }
  );

  const districtStores = useMemo(() => {
    const n = config.addressKeyword.toLowerCase();
    return stores.filter((s) =>
      `${s.roadAddress ?? ""} ${s.address ?? ""}`.toLowerCase().includes(n)
    );
  }, [stores, config.addressKeyword]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchReference = useMemo(
    () =>
      exploreAnchor ??
      userLocation ??
      mapCenterOverride ??
      config.mapCenter,
    [config.mapCenter, exploreAnchor, mapCenterOverride, userLocation]
  );

  const searchResultsAll = useMemo(
    () =>
      loading || !searchQuery.trim()
        ? []
        : filterStoresForSearch(
            districtStores,
            searchQuery,
            activeFilter,
            searchReference
          ),
    [activeFilter, districtStores, loading, searchQuery, searchReference]
  );

  const [searchVisibleCount, setSearchVisibleCount] = useState(SEARCH_LIST_BATCH);

  useEffect(() => {
    setSearchVisibleCount(SEARCH_LIST_BATCH);
  }, [searchOpen, searchQuery, activeFilter, searchReference.lat, searchReference.lng, loading]);

  const searchResultsVisible = useMemo(
    () => searchResultsAll.slice(0, searchVisibleCount),
    [searchResultsAll, searchVisibleCount]
  );

  const searchHasMore = searchVisibleCount < searchResultsAll.length;

  const loadMoreSearchResults = useCallback(() => {
    setSearchVisibleCount((c) => Math.min(c + SEARCH_LIST_BATCH, searchResultsAll.length));
  }, [searchResultsAll.length]);

  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const [manualCenter, setManualCenter] = useState<LatLng>(config.mapCenter);
  const [centerVersion, setCenterVersion] = useState(0);

  const mapStores = useMemo(() => {
    if (!selectedStore) return sortedStores;
    const existsInMap = sortedStores.some((store) => store.id === selectedStore.id);
    if (existsInMap) return sortedStores;
    return [selectedStore, ...sortedStores];
  }, [selectedStore, sortedStores]);

  const center = useMemo(
    () => mapCenterOverride ?? userLocation ?? manualCenter,
    [mapCenterOverride, manualCenter, userLocation]
  );

  const handleFilterChange = useCallback((filter: StoreListFilter) => {
    sendGtagEvent("filter_select", { filter, page: config.slug });
    setActiveFilter(filter);
  }, [config.slug]);

  const handleMapMarkerSelect = (store: StoreData) => {
    const resolved = storesById.get(store.id) ?? store;
    sendGtagEvent("click_marker", { store_id: resolved.id, page: config.slug });
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
    setCenterVersion((v) => v + 1);
    setSheetView("detail");
    setExploreAnchor(pos);
    setSearchOpen(false);
  };

  const handleMoveToLocation = () => {
    sendGtagEvent("click_my_location", { page: config.slug });
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
      setManualCenter(config.mapCenter);
    }
    setCenterVersion((v) => v + 1);
  };

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
      <div className="flex min-h-[50vh] items-center justify-center bg-bg-canvas px-4">
        <p className="rounded-xl bg-danger-50 px-4 py-3 text-body-sm text-danger-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-[min(78vh,640px)] max-w-md overflow-hidden rounded-xl border border-black/5 bg-bg-canvas shadow-sm md:h-[70vh]">
      {isLoading ? (
        <div className="flex h-full items-center justify-center text-body-sm text-text-secondary">
          카카오 지도를 불러오는 중입니다...
        </div>
      ) : (
        <>
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
          <section className="absolute left-[15px] right-[15px] top-[calc(12px+env(safe-area-inset-top,0px))] z-sheet flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-white px-3 py-2 text-left shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <img src="/Img/Icon/search_24.svg" alt="" width={22} height={22} className="shrink-0" />
              <span className="flex h-full min-w-0 flex-1 items-center text-[15px] font-normal text-[#999999]">
                {config.labelGu} 업체명·주소 검색
              </span>
            </button>
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
                  width={72}
                  height={72}
                  className="h-[72px] w-[72px]"
                />
              </button>
            </div>
          </section>

          {SHOW_HOME_REPORT_BUTTON && !bottomSheetExpanded && sheetView === "list" ? (
            <Link
              href="/report"
              onClick={() => sendGtagEvent("click_report", { page: config.slug })}
              className="absolute bottom-[32%] right-[12px] z-[35] flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-3 py-2.5 text-[15px] font-bold text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)]"
            >
              <img src="/Img/Icon/write_24.svg" alt="" width={22} height={22} className="shrink-0" />
              <span>제보하기</span>
            </Link>
          ) : null}

          <LocationPermissionModal
            open={locationModalOpen}
            onClose={() => setLocationModalOpen(false)}
            onAllow={() => {
              setLocationModalOpen(false);
              requestLocation();
            }}
          />

          <HomeSearchOverlay
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            activeFilter={activeFilter}
            onActiveFilterChange={handleFilterChange}
            totalMatchCount={searchResultsAll.length}
            results={searchResultsVisible}
            hasMoreResults={searchHasMore}
            onLoadMoreResults={loadMoreSearchResults}
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
              expanded={bottomSheetExpanded}
              onExpandedChange={setBottomSheetExpanded}
            />
          )}
        </>
      )}
    </div>
  );
}
