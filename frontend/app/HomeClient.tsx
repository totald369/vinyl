"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BottomSheetList from "@/components/BottomSheetList";
import HomeSearchOverlay from "@/components/HomeSearchOverlay";
import MapView from "@/components/MapView";
import StoreDetailSheet from "@/components/StoreDetailSheet";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { filterStoresForSearch } from "@/lib/storeSearch";
import { DEFAULT_REGION } from "@/lib/types";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { StoreData, useStores } from "@/hooks/useStores";
import { useUserLocation } from "@/hooks/useUserLocation";

type HomeFilter = "payBag" | "largeSticker";

export default function HomeClient() {
  const { isLoading, error } = useKakaoMapLoader();
  const { userLocation, permission } = useUserLocation();
  const [activeFilter, setActiveFilter] = useState<HomeFilter>("payBag");
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [sheetView, setSheetView] = useState<"list" | "detail">("list");
  const { selectedStore, setSelectedStore, sortedStores, stores, defaultCenter, loading } = useStores(
    userLocation,
    { activeFilter }
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchReference = useMemo(
    () => userLocation ?? { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng },
    [userLocation]
  );

  const searchResults = useMemo(
    () =>
      loading || !searchQuery.trim()
        ? []
        : filterStoresForSearch(stores, searchQuery, activeFilter, searchReference),
    [activeFilter, loading, searchQuery, searchReference, stores]
  );

  const [manualCenter, setManualCenter] = useState(defaultCenter);
  const center = useMemo(
    () =>
      selectedStore
        ? { lat: Number(selectedStore.lat), lng: Number(selectedStore.lng) }
        : userLocation ?? manualCenter,
    [manualCenter, selectedStore, userLocation]
  );

  const handleSelectStore = (store: StoreData) => {
    setSelectedStore(store);
    setManualCenter({ lat: Number(store.lat), lng: Number(store.lng) });
    setSheetView("detail");
  };

  const handleMoveToLocation = () => {
    setSelectedStore(null);
    setSheetView("list");
    if (userLocation) {
      setManualCenter(userLocation);
      return;
    }
    setManualCenter({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
  };

  useEffect(() => {
    if (!selectedStore) return;
    const exists = sortedStores.some((store) => store.id === selectedStore.id);
    if (!exists) {
      setSelectedStore(null);
    }
  }, [selectedStore, setSelectedStore, sortedStores]);

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
          <MapView
            center={center}
            stores={loading ? [] : sortedStores}
            selectedStoreId={selectedStore?.id}
            onSelectStore={handleSelectStore}
            userMarkerPosition={permission === "granted" && userLocation ? userLocation : null}
          />
          <section className="absolute left-[15px] right-[15px] top-[calc(16px+env(safe-area-inset-top,0px))] z-sheet flex flex-col gap-4">
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

          {SHOW_HOME_REPORT_BUTTON && !bottomSheetExpanded && sheetView === "list" ? (
            <Link
              href="/report"
              className="absolute bottom-[306px] right-[15px] z-[35] flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)]"
            >
              <img src="/Img/Icon/write_24.svg" alt="" width={24} height={24} className="shrink-0" />
              <span>제보하기</span>
            </Link>
          ) : null}

          <HomeSearchOverlay
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            activeFilter={activeFilter}
            onActiveFilterChange={setActiveFilter}
            results={searchResults}
            onSelectStore={(store) => {
              handleSelectStore(store);
              setSearchOpen(false);
            }}
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
              onSelectStore={handleSelectStore}
              activeFilter={activeFilter}
              onChangeFilter={setActiveFilter}
              expanded={bottomSheetExpanded}
              onExpandedChange={setBottomSheetExpanded}
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
