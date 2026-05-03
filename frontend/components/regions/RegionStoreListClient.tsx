"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HomeMapStage from "@/components/home/HomeMapStage";
import { STORE_SHEET_VIRTUAL_ROW_EST_PX, StoreSheetVirtualRow } from "@/components/BottomSheetList";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import type { StoreListFilter } from "@/hooks/useStores";
import { useStoreDetailAugment } from "@/hooks/useStoreDetailAugment";
import { useUserLocation } from "@/hooks/useUserLocation";
import { trackRegionEvent } from "@/lib/analytics";
import type { ResolvedRegionLeaf } from "@/lib/koreaRegions";
import { leafToRegionPath } from "@/lib/koreaRegions";
import {
  sampleSeoLandingsExclusiveOf,
  seoKeywordLandingPublicPath,
  seoLandingsSharingRegion
} from "@/lib/seoKeywordLandings";
import { SHOW_HOME_REPORT_BUTTON } from "@/lib/featureFlags";
import { sendGtagEvent } from "@/lib/gtag";
import { prefetchStoreDetail } from "@/lib/storeDetailClient";
import { filterStoresForSearch } from "@/lib/storeSearch";
import {
  parseRegionCategoryParam,
  regionCategoryKo,
  type RegionSeoCategory
} from "@/lib/regionPageMetadata";
import type { StoreData } from "@/lib/storeData";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";

const StoreDetailSheet = dynamic(() => import("@/components/StoreDetailSheet"), { ssr: false });
const HomeSearchOverlay = dynamic(() => import("@/components/HomeSearchOverlay"), { ssr: false });
const LocationPermissionModal = dynamic(() => import("@/components/LocationPermissionModal"), {
  ssr: false
});

const REGION_SEARCH_BATCH = 100;

async function fetchRegionStores(opts: {
  regionPath: string;
  category: RegionSeoCategory;
  offset: number;
  limit: number;
  lat?: number;
  lng?: number;
}) {
  const qs = new URLSearchParams({
    regionPath: opts.regionPath,
    filter: opts.category === "largeSticker" ? "largeSticker" : opts.category,
    offset: String(opts.offset),
    limit: String(opts.limit)
  });
  if (
    opts.lat != null &&
    opts.lng != null &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng)
  ) {
    qs.set("lat", String(opts.lat));
    qs.set("lng", String(opts.lng));
  }
  const res = await fetch(`/api/stores?${qs.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`region_fetch_${res.status}`);
  return res.json() as Promise<{
    mode: string;
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    stores: StoreData[];
  }>;
}

function centroidFromStores(list: StoreData[]): LatLng | null {
  const valid = list.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
  if (!valid.length) return null;
  let lat = 0;
  let lng = 0;
  for (const s of valid) {
    lat += Number(s.lat);
    lng += Number(s.lng);
  }
  return { lat: lat / valid.length, lng: lng / valid.length };
}

type Props = {
  leaf: ResolvedRegionLeaf;
  slugSegments: string[];
};

export default function RegionStoreListClient({ leaf, slugSegments }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, error } = useKakaoMapLoader();

  const { permission, userLocation, requestLocation } = useUserLocation();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisibleCount, setSearchVisibleCount] = useState(REGION_SEARCH_BATCH);

  const regionPath = useMemo(() => leafToRegionPath(leaf), [leaf]);
  const pickerInitial = encodeURIComponent(regionPath);
  const inlineSeoLandings = useMemo(() => {
    const mine = seoLandingsSharingRegion(leaf);
    return mine.length ? mine.slice(0, 4) : sampleSeoLandingsExclusiveOf(undefined).slice(0, 4);
  }, [leaf]);

  const [category, setCategory] = useState<RegionSeoCategory>(() =>
    parseRegionCategoryParam(searchParams.get("filter") ?? undefined)
  );
  const [stores, setStores] = useState<StoreData[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const trackedOpenRef = useRef(false);

  const [sheetView, setSheetView] = useState<"list" | "detail">("list");
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [manualCenter, setManualCenter] = useState<LatLng>(() => ({
    lat: DEFAULT_REGION.lat,
    lng: DEFAULT_REGION.lng
  }));
  const [centerVersion, setCenterVersion] = useState(0);
  const [mapCenterOverride, setMapCenterOverride] = useState<LatLng | null>(null);

  const center = useMemo(
    () => mapCenterOverride ?? (permission === "granted" && userLocation ? userLocation : null) ?? manualCenter,
    [manualCenter, mapCenterOverride, permission, userLocation]
  );

  const searchResultsAll = useMemo(
    () =>
      loading || !searchQuery.trim()
        ? []
        : filterStoresForSearch(stores, searchQuery, category, center),
    [stores, searchQuery, category, center, loading]
  );

  useEffect(() => {
    setSearchVisibleCount(REGION_SEARCH_BATCH);
  }, [searchOpen, searchQuery, category, center.lat, center.lng, loading]);

  const searchResultsVisible = useMemo(
    () => searchResultsAll.slice(0, searchVisibleCount),
    [searchResultsAll, searchVisibleCount]
  );
  const searchHasMoreClient = searchVisibleCount < searchResultsAll.length;

  const loadMoreSearchResults = useCallback(() => {
    setSearchVisibleCount((c) => Math.min(c + REGION_SEARCH_BATCH, searchResultsAll.length));
  }, [searchResultsAll.length]);

  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const listRowVirtualizer = useVirtualizer({
    count: loading && stores.length === 0 ? 0 : stores.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => STORE_SHEET_VIRTUAL_ROW_EST_PX,
    overscan: 10
  });

  const mapStores = useMemo(() => {
    if (!selectedStore) return stores;
    if (stores.some((s) => s.id === selectedStore.id)) return stores;
    return [selectedStore, ...stores];
  }, [stores, selectedStore]);

  const detailAugmenting = useStoreDetailAugment(
    sheetView,
    selectedStore,
    center,
    setSelectedStore
  );

  const onPrefetchStore = useCallback((row: StoreData) => prefetchStoreDetail(row.id, center), [center]);

  const geoLat = permission === "granted" && userLocation ? userLocation.lat : undefined;
  const geoLng = permission === "granted" && userLocation ? userLocation.lng : undefined;

  const syncCategoryUrl = useCallback(
    (c: RegionSeoCategory) => {
      const path = `/regions/${slugSegments.map((s) => encodeURIComponent(s)).join("/")}`;
      const qs = new URLSearchParams();
      if (c !== "payBag") qs.set("filter", c);
      router.replace((qs.size ? `${path}?${qs}` : path) as Route, { scroll: false });
    },
    [router, slugSegments]
  );

  useEffect(() => {
    const fromUrl = parseRegionCategoryParam(searchParams.get("filter") ?? undefined);
    setCategory((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  const appendFetchLockRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const runReload = useCallback(
    async (startOffset: number, append: boolean) => {
      if (append) {
        if (!hasMoreRef.current || appendFetchLockRef.current) return;
        appendFetchLockRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setErrorMsg(null);
      }
      try {
        const data = await fetchRegionStores({
          regionPath,
          category,
          offset: startOffset,
          limit: 40,
          lat: geoLat,
          lng: geoLng
        });
        setTotal(data.total ?? 0);
        setHasMore(data.hasMore === true);
        const added = data.stores?.length ?? 0;
        setOffset(startOffset + added);
        setStores((prev) => (append ? [...prev, ...(data.stores ?? [])] : (data.stores ?? [])));

        if (!append) {
          const c = centroidFromStores(data.stores ?? []);
          if (c) {
            setManualCenter(c);
            setCenterVersion((v) => v + 1);
          }
        }
      } catch {
        setErrorMsg("판매처를 불러오지 못했습니다.");
        if (!append) setStores([]);
      } finally {
        if (append) appendFetchLockRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [regionPath, category, geoLat, geoLng]
  );

  const onLoadMore = useCallback(() => {
    if (loading || loadingMore) return;
    void runReload(offset, true);
  }, [loading, loadingMore, offset, runReload]);

  useEffect(() => {
    void runReload(0, false);
  }, [runReload]);

  useEffect(() => {
    if (trackedOpenRef.current) return;
    trackedOpenRef.current = true;
    trackRegionEvent("open_region_view", {
      province: leaf.shortNameKo,
      city: leaf.cityNameKo ?? "",
      district: leaf.districtNameKo ?? "",
      region_path: regionPath
    });
  }, [leaf, regionPath]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = () => setDropdownOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!selectedStore) return;
    const exists = stores.some((s) => s.id === selectedStore.id);
    if (!exists) {
      setSelectedStore(null);
      setSheetView("list");
    }
  }, [selectedStore, stores]);

  useEffect(() => {
    if (!selectedStore) setSheetView("list");
  }, [selectedStore]);

  const handleCloseDetailSheet = useCallback(() => {
    setSheetView("list");
    setSelectedStore(null);
    setMapCenterOverride(null);
  }, []);

  const trackClickRegionStore = useCallback(
    (storeId: string) =>
      trackRegionEvent("click_region_store", {
        province: leaf.shortNameKo,
        city: leaf.cityNameKo ?? "",
        district: leaf.districtNameKo ?? "",
        category: regionCategoryKo(category),
        region_path: regionPath,
        store_id: storeId
      }),
    [leaf, category, regionPath]
  );

  const handleMapMarkerSelect = useCallback(
    (store: StoreData) => {
      const resolved = storesById.get(store.id) ?? store;
      sendGtagEvent("click_marker", { store_id: resolved.id });
      trackClickRegionStore(resolved.id);
      const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
      setSelectedStore(resolved);
      setMapCenterOverride(pos);
      setCenterVersion((v) => v + 1);
      setSheetView("detail");
    },
    [storesById, trackClickRegionStore]
  );

  const handleSelectStoreWithPan = useCallback(
    (store: StoreData) => {
      const resolved = storesById.get(store.id) ?? store;
      trackClickRegionStore(resolved.id);
      const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
      setSelectedStore(resolved);
      setManualCenter(pos);
      setMapCenterOverride(pos);
      setCenterVersion((v) => v + 1);
      setSheetView("detail");
    },
    [storesById, trackClickRegionStore]
  );

  const handleSearchSelectStore = useCallback(
    (store: StoreData) => {
      const resolved = storesById.get(store.id) ?? store;
      trackClickRegionStore(resolved.id);
      const pos = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
      setSelectedStore(resolved);
      setManualCenter(pos);
      setMapCenterOverride(pos);
      setCenterVersion((v) => v + 1);
      setSheetView("detail");
      setSearchOpen(false);
    },
    [storesById, trackClickRegionStore]
  );

  const handleMoveToLocation = useCallback(() => {
    sendGtagEvent("click_my_location", { page: "region" });
    if (permission !== "granted") {
      setLocationModalOpen(true);
      return;
    }
    setSelectedStore(null);
    setSheetView("list");
    setMapCenterOverride(null);
    if (userLocation) {
      setManualCenter(userLocation);
    } else if (stores.length > 0) {
      const c = centroidFromStores(stores);
      if (c) setManualCenter(c);
    }
    setCenterVersion((v) => v + 1);
  }, [permission, userLocation, stores]);

  const handleLocationPermissionAllow = useCallback(() => {
    setLocationModalOpen(false);
    requestLocation();
  }, [requestLocation]);

  const handleFilterChange = useCallback(
    (f: StoreListFilter) => {
      setCategory(f);
      syncCategoryUrl(f);
      setMapCenterOverride(null);
      trackRegionEvent("select_store_category", {
        province: leaf.shortNameKo,
        city: leaf.cityNameKo ?? "",
        district: leaf.districtNameKo ?? "",
        category: regionCategoryKo(f),
        region_path: regionPath
      });
    },
    [leaf, regionPath, syncCategoryUrl]
  );

  const onPickCategoryFromDropdown = (c: RegionSeoCategory) => {
    setDropdownOpen(false);
    handleFilterChange(c);
  };

  const filterRowReplacement = (
    <>
      <div className="flex flex-col gap-1">
        <Link
          href={`/regions?initial=${pickerInitial}` as Route}
          className="inline-flex w-fit items-center gap-0.5 rounded-md p-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          onClick={() =>
            trackRegionEvent("select_region", {
              province: leaf.shortNameKo,
              city: leaf.cityNameKo ?? "",
              district: leaf.districtNameKo ?? "",
              category: regionCategoryKo(category),
              region_path: regionPath
            })
          }
        >
          <span className="text-[18px] font-bold leading-normal tracking-[0.1px] text-[#171717]">
            {leaf.headingLabelKo}
          </span>
          <img src="/Img/Icon/chevronDown_24_black.svg" alt="" width={24} height={24} className="shrink-0" />
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          <div className="relative z-40">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen((o) => !o);
              }}
              className="inline-flex items-center gap-0.5 rounded-[8px] bg-[#171717] py-2 pl-2 pr-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <img
                src={
                  category === "nonBurnable"
                    ? "/Img/Icon/non-fire_24.svg"
                    : category === "largeSticker"
                      ? "/Img/Icon/sticker_24.svg"
                      : "/Img/Icon/trash_bag_24.svg"
                }
                alt=""
                width={24}
                height={24}
              />
              <span className="text-[14px] font-semibold leading-normal tracking-[0.1px] text-white">
                {regionCategoryKo(category)}
              </span>
              <img src="/Img/Icon/chevronDown_24_white.svg" alt="" width={24} height={24} />
            </button>
            {dropdownOpen ? (
              <div
                className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[200px] overflow-hidden rounded-[8px] border border-[#eee] bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                role="listbox"
                onClick={(e) => e.stopPropagation()}
              >
                {(
                  [
                    ["payBag", "종량제 봉투", "/Img/Icon/trash_bag_24.svg"],
                    ["nonBurnable", "불연성마대", "/Img/Icon/non-fire_24.svg"],
                    ["largeSticker", "대형폐기물스티커", "/Img/Icon/sticker_24.svg"]
                  ] as const
                ).map(([key, label, icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={category === key}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[#171717] hover:bg-[#f7f7f7]"
                    onClick={() => onPickCategoryFromDropdown(key)}
                  >
                    <img src={icon} alt="" width={20} height={20} />
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span className="text-[18px] font-normal tracking-[0.1px] text-[#171717]">
            판매처를 확인하세요.
          </span>
        </div>
      </div>
    </>
  );

  const listStatsSlot = (
    <div className="shrink-0 pb-2 pt-4">
      {!loading ? (
        <p className="pl-2 text-[14px] tracking-[0.1px] text-black">
          <span className="font-normal">총 </span>
          <span className="font-bold tabular-nums">{total}</span>
          <span className="font-normal">건</span>
        </p>
      ) : (
        <p className="pl-2 text-[14px] font-normal text-[#999]">불러오는 중…</p>
      )}
      {errorMsg ? <p className="pl-2 pt-2 text-[13px] text-danger-700">{errorMsg}</p> : null}
    </div>
  );

  useEffect(() => {
    if (sheetView !== "list") return;
    const root = listScrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || !hasMore || loadingMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sheetView, hasMore, loadingMore, loading, onLoadMore, stores.length]);

  const emptyListSlot =
    !loading && !errorMsg && total === 0 ? (
      <div className="flex min-h-[min(50dvh,360px)] flex-col items-center justify-center gap-4 px-4 pb-10 text-center">
        <div className="relative size-16 shrink-0 overflow-hidden">
          <img src="/Img/Icon/empty_64.svg" alt="" width={64} height={64} className="size-16" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <p className="text-[16px] font-bold leading-[1.5] text-[#171717]">
              등록된 판매처가 없습니다.
            </p>
            <div className="max-w-[300px] text-[16px] font-normal leading-[1.5] text-[#666666]">
              <p className="mb-0">판매처를 제보해주시면 확인 과정을 거쳐</p>
              <p className="mb-0">2~3일 내에 업데이트됩니다.</p>
            </div>
          </div>
          <Link
            href="/report"
            onClick={() => sendGtagEvent("click_report", { surface: "region_empty_list" })}
            className="flex h-12 w-[150px] shrink-0 items-center justify-center rounded-[8px] bg-[#171717] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            제보하기
          </Link>
        </div>
      </div>
    ) : undefined;

  return (
    <main className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-bg-canvas">
      <div className="fixed inset-y-0 left-0 right-0 z-0 flex h-[100dvh] justify-center">
        <div className="relative h-full min-h-0 w-full max-w-md">
          <div className="absolute inset-0 z-0">
            <HomeMapStage
              kakaoLoading={isLoading}
              center={center}
              centerVersion={centerVersion}
              preferredMapLevel={selectedStore ? 6 : 5}
              stores={loading ? [] : mapStores}
              activeFilter={category}
              selectedStoreId={selectedStore?.id}
              onSelectStore={handleMapMarkerSelect}
              userMarkerPosition={permission === "granted" && userLocation ? userLocation : null}
            />
          </div>

          {sheetView === "detail" ? (
            <section className="pointer-events-none absolute left-[15px] right-[15px] top-[calc(16px+env(safe-area-inset-top,0px))] z-sheet flex flex-col gap-2">
              <div className="pointer-events-auto flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="flex h-12 min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-white px-4 py-2 text-left shadow-[0px_0px_1px_rgba(0,0,0,0.08),0px_4px_6px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <img src="/Img/Icon/search_24.svg" alt="" width={24} height={24} className="shrink-0" />
                  <span className="flex h-full min-w-0 flex-1 items-center text-[16px] font-normal leading-normal tracking-[-0.3px] text-[#999999]">
                    주소나 업체명을 검색해주세요
                  </span>
                </button>
                <Link
                  href={`/regions?initial=${pickerInitial}` as Route}
                  prefetch={false}
                  className="flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] bg-[#171717] px-4 py-2 text-[16px] font-semibold leading-normal tracking-[-0.3px] text-[#d4fe1c] shadow-[0px_0px_1px_rgba(0,0,0,0.08),0px_4px_6px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  onClick={() =>
                    trackRegionEvent("select_region", {
                      province: leaf.shortNameKo,
                      city: leaf.cityNameKo ?? "",
                      district: leaf.districtNameKo ?? "",
                      category: regionCategoryKo(category),
                      region_path: regionPath
                    })
                  }
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
          ) : null}

          {sheetView === "list" ? (
            <div className="pointer-events-auto fixed inset-0 z-[60] flex justify-center bg-white">
              <div className="relative flex h-[100dvh] w-full max-w-md flex-col bg-white pt-[env(safe-area-inset-top,0px)]">
                <header className="flex shrink-0 items-center gap-1 pr-2">
                  <button
                    type="button"
                    aria-label="뒤로"
                    className="flex size-12 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    onClick={() => router.back()}
                  >
                    <img src="/Img/Icon/back_32.svg" alt="" width={32} height={32} />
                  </button>
                  <span className="min-w-0 flex-1" aria-hidden />
                  <Link
                    href="/"
                    className="flex size-12 shrink-0 items-center justify-center rounded-none border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    aria-label="홈으로 닫기"
                  >
                    <img src="/Img/Icon/close_32.svg" alt="" width={32} height={32} />
                  </Link>
                </header>
                <div className="flex min-h-0 flex-1 flex-col px-4 pt-[4px]">
                  <div className="shrink-0">{filterRowReplacement}</div>
                  <div
                    ref={listScrollRef}
                    role="region"
                    aria-label="지역 판매처 목록"
                    className="scrollbar-map-list mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-0 pb-[env(safe-area-inset-bottom,0px)]"
                  >
                    {listStatsSlot}
                    {loading && stores.length === 0 ? (
                      Array.from({ length: 4 }, (_, i) => (
                        <div key={`sk-${i}`} className="px-2 py-4" aria-hidden>
                          <div className="flex flex-col gap-3">
                            <div className="h-4 w-[72%] animate-pulse rounded-[6px] bg-neutral-200" />
                            <div className="h-[14px] w-[48%] animate-pulse rounded-[6px] bg-neutral-100" />
                          </div>
                        </div>
                      ))
                    ) : stores.length === 0 ? (
                      <div className="min-h-[40vh]">{emptyListSlot}</div>
                    ) : (
                      <>
                        <div className="relative w-full" style={{ height: listRowVirtualizer.getTotalSize() }}>
                          {listRowVirtualizer.getVirtualItems().map((vi) => {
                            const row = stores[vi.index];
                            return (
                              <div
                                key={vi.key}
                                className="absolute left-0 top-0 w-full"
                                style={{ transform: `translateY(${vi.start}px)` }}
                              >
                                <StoreSheetVirtualRow
                                  store={row}
                                  selected={selectedStore?.id === row.id}
                                  index={vi.index}
                                  total={stores.length}
                                  onSelectStore={handleSelectStoreWithPan}
                                  onPrefetchStore={onPrefetchStore}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {hasMore ? (
                          <div ref={loadMoreSentinelRef} className="h-px w-full shrink-0" aria-hidden />
                        ) : null}
                        {loadingMore ? (
                          <div className="flex justify-center py-4" role="status" aria-busy="true">
                            <span className="text-[13px] tracking-[0.1px] text-[#999999]">
                              불러오는 중…
                            </span>
                          </div>
                        ) : null}
                      </>
                    )}
                    {!loading && inlineSeoLandings.length ? (
                      <aside
                        className="mx-2 mb-[calc(12px+env(safe-area-inset-bottom,0px))] mt-4 rounded-[10px] border border-[#eee] bg-[#fafafa] px-3 py-4"
                        aria-label="검색 안내 문서"
                      >
                        <p className="text-[13px] font-semibold leading-snug text-[#171717]">
                          이 지역 관련 안내
                        </p>
                        <ul className="mt-2 space-y-2 text-[13px] leading-[1.45] text-[#454545]">
                          {inlineSeoLandings.map((item) => (
                            <li key={item.slug}>
                              <Link
                                href={seoKeywordLandingPublicPath(item.slug) as Route}
                                prefetch={false}
                                className="underline decoration-[#ccc] underline-offset-2 hover:text-[#171717]"
                              >
                                {item.headline}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </aside>
                    ) : null}
                  </div>
                </div>
                {SHOW_HOME_REPORT_BUTTON && !(!loading && !errorMsg && total === 0) ? (
                  <Link
                    href="/report"
                    onClick={() => sendGtagEvent("click_report")}
                    className="pointer-events-auto absolute bottom-[calc(28px+env(safe-area-inset-bottom,0px))] right-[15px] z-10 flex items-center gap-0.5 rounded-full bg-[#d4fe1c] px-4 py-3 text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717] shadow-[0px_0px_2px_0px_rgba(0,0,0,0.08),0px_4px_12px_0px_rgba(0,0,0,0.16)]"
                  >
                    <img src="/Img/Icon/write_24.svg" alt="" width={24} height={24} className="shrink-0" />
                    <span>제보하기</span>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <LocationPermissionModal
            open={locationModalOpen}
            onClose={() => setLocationModalOpen(false)}
            onAllow={handleLocationPermissionAllow}
          />

          {searchOpen ? (
            <div className="pointer-events-auto fixed inset-0 z-[70] flex justify-center">
              <div className="relative h-full w-full max-w-md">
                <HomeSearchOverlay
                  open={searchOpen}
                  onClose={() => setSearchOpen(false)}
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  activeFilter={category}
                  onActiveFilterChange={handleFilterChange}
                  totalMatchCount={searchResultsAll.length}
                  loading={loading}
                  results={searchResultsVisible}
                  hasMoreResults={searchHasMoreClient}
                  loadingMoreResults={false}
                  onLoadMoreResults={loadMoreSearchResults}
                  onSelectStore={handleSearchSelectStore}
                />
              </div>
            </div>
          ) : null}

          {selectedStore && sheetView === "detail" ? (
            <StoreDetailSheet
              store={selectedStore}
              onClose={handleCloseDetailSheet}
              userLocation={permission === "granted" && userLocation ? userLocation : null}
              kakaoMapsReady={!isLoading && !error}
              isAugmentingDetail={detailAugmenting}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
