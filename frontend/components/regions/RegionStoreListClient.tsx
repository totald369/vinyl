"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HomeMapStage from "@/components/home/HomeMapStage";
import LocationRequestingOverlay from "@/components/LocationRequestingOverlay";
import { STORE_SHEET_VIRTUAL_ROW_EST_PX, StoreSheetVirtualRow } from "@/components/BottomSheetList";
import { RegionStoreListRowSkeletons } from "@/components/regions/RegionStoreListSkeleton";
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
import { filterStoresForSearchAsync } from "@/lib/storeSearchWorker";
import {
  parseRegionCategoryParam,
  regionCategoryKo,
  type RegionSeoCategory
} from "@/lib/regionPageMetadata";
import type { StoreData } from "@/lib/storeData";
/**
 * server-only 모듈에서 타입만 가져온다 — `import type` 으로 표기해 webpack 모듈 그래프에
 * 실제 구현(getStoreSearchIndexes 등) 이 끌려오지 않도록 보장.
 */
import type { RegionInitialPayload } from "@/lib/server/regionPayload";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

const StoreDetailSheet = dynamic(() => import("@/components/StoreDetailSheet"), { ssr: false });
const HomeSearchOverlay = dynamic(() => import("@/components/HomeSearchOverlay"), { ssr: false });
const LocationPermissionModal = dynamic(() => import("@/components/LocationPermissionModal"), {
  ssr: false
});

const REGION_SEARCH_BATCH = 100;

/**
 * 변경 전: opts.lat/lng 을 쿼리로 함께 보내 서버가 거리 정렬 + distance 필드를 채움.
 *          → 사용자별 URL 이 달라 Cache-Control: public, s-maxage=600 가 CDN/Edge 에서 hit 0.
 *          → 위치 권한 grant/deny 전후로 같은 region 을 두 번 fetch.
 * 변경 후: 항상 lat/lng 미지정으로 호출 → URL 이 (regionPath, filter, offset, limit) 만으로 결정 →
 *          CDN/Edge cache hit 율 ~100%. 거리 정렬·distance 표시는 클라이언트의 sortedStores 가 채움.
 */
async function fetchRegionStores(opts: {
  regionPath: string;
  category: RegionSeoCategory;
  offset: number;
  limit: number;
}) {
  const qs = new URLSearchParams({
    regionPath: opts.regionPath,
    filter: opts.category === "largeSticker" ? "largeSticker" : opts.category,
    offset: String(opts.offset),
    limit: String(opts.limit)
  });
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
  /**
   * server component(`app/regions/[...slug]/page.tsx`) 가 ISR(600s) 로 빌드한 첫 페이지 데이터.
   * 마운트 즉시 사용 → CSR fetch round-trip 1회 + spinner 노출 시간 제거.
   * URL 의 ?filter 가 기본값(payBag) 일 때만 사용, 그 외 카테고리는 클라이언트가 fetch.
   */
  initialPayload?: RegionInitialPayload;
};

export default function RegionStoreListClient({ leaf, slugSegments, initialPayload }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, error } = useKakaoMapLoader();

  const { permission, userLocation, geolocationBlocked, requestLocation, syncBrowserPermission } =
    useUserLocation();
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

  /**
   * SSR 초기 페이로드는 category === initialPayload.category 일 때만 채택.
   * URL ?filter 가 비-기본일 경우 클라이언트가 fetch 로 보강 → 두 경로 모두 안전.
   */
  const useInitialPayload = !!initialPayload && initialPayload.category === category;

  const [stores, setStores] = useState<StoreData[]>(() =>
    useInitialPayload ? (initialPayload!.stores as StoreData[]) : []
  );
  const [total, setTotal] = useState(useInitialPayload ? initialPayload!.total : 0);
  const [offset, setOffset] = useState(useInitialPayload ? initialPayload!.stores.length : 0);
  const [hasMore, setHasMore] = useState(useInitialPayload ? initialPayload!.hasMore : false);
  const [loading, setLoading] = useState(!useInitialPayload);
  const [loadingMore, setLoadingMore] = useState(false);

  /** 첫 useEffect[runReload] 실행을 한 번 skip 하기 위한 latch. SSR 데이터가 있을 때만 켜진다. */
  const initialFetchSkipRef = useRef(useInitialPayload);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const trackedOpenRef = useRef(false);
  /**
   * `requestLocation()` 비동기 완료 전에는 userLocation 이 비어 있을 수 있음.
   * 내 위치 버튼: 허용 상태에서 탭 시 반드시 user 좌표로 맵 이동 — 좌표 도착 시 1회 center 반영.
   */
  const moveToUserAfterLocationRef = useRef(false);
  const [showGeoProgressUi, setShowGeoProgressUi] = useState(false);

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

  /**
   * [INP] 변경 전: filterStoresForSearch 를 useMemo 로 매 키 입력마다 메인 스레드에서 동기 실행 →
   *  region 데이터가 큰 도시(수백~수천 매장)에서 input INP 가 튐.
   * 변경 후: filterStoresForSearchAsync (Web Worker) 로 분리.
   *  - stores.length < 400 (대부분의 region) 은 동기 실행 (worker 송수신 비용 회피).
   *  - stores.length >= 400 은 worker 로 위임 → 메인 스레드 차단 시간 ~0.
   *  - 키 입력 race condition 은 latest seq 만 채택해 stale 결과 무시.
   */
  const [searchResultsAll, setSearchResultsAll] = useState<StoreData[]>([]);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (loading || !searchQuery.trim()) {
      setSearchResultsAll([]);
      return;
    }
    const seq = ++searchSeqRef.current;
    let cancelled = false;
    filterStoresForSearchAsync(stores, searchQuery, category, center)
      .then((rows) => {
        if (cancelled) return;
        if (seq !== searchSeqRef.current) return;
        setSearchResultsAll(rows);
      })
      .catch(() => {
        if (cancelled) return;
        if (seq !== searchSeqRef.current) return;
        setSearchResultsAll([]);
      });
    return () => {
      cancelled = true;
    };
    /* center 는 useMemo 로 lat/lng 동일 시 참조 안정 — 통째로 deps. */
  }, [stores, searchQuery, category, center, loading]);

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

  const geoLat = permission === "granted" && userLocation ? userLocation.lat : undefined;
  const geoLng = permission === "granted" && userLocation ? userLocation.lng : undefined;

  /**
   * 변경 전: 서버에서 origin lat/lng 받아 거리 정렬 + distance 채움 → URL 캐시 키 fragment 로 CDN hit 0%,
   *          위치 권한 grant/deny 전후 같은 region 을 2회 fetch.
   * 변경 후: 서버는 name 정렬·distance 없이 응답(단일 캐시 키 → CDN hit 100%).
   *          사용자 위치(geo)가 있으면 클라이언트에서 거리 정렬·distance 주입.
   *          - 위치 권한 변동만으로는 추가 fetch 발생 X (정렬만 재계산).
   *          - 정렬 비용은 region 규모 N (구 단위 보통 < 1000) 의 O(N log N) — 단발 1ms 내외.
   */
  const sortedStores = useMemo<StoreData[]>(() => {
    if (geoLat == null || geoLng == null || stores.length === 0) return stores;
    const withDist = stores.map((s) => {
      const d = getDistanceKm(geoLat, geoLng, Number(s.lat), Number(s.lng));
      return Number.isFinite(d) ? ({ ...s, distance: d } as StoreData) : s;
    });
    withDist.sort((a, b) => {
      const da = typeof a.distance === "number" ? a.distance : Number.POSITIVE_INFINITY;
      const db = typeof b.distance === "number" ? b.distance : Number.POSITIVE_INFINITY;
      return da - db;
    });
    return withDist;
  }, [stores, geoLat, geoLng]);

  const storesById = useMemo(() => new Map(sortedStores.map((s) => [s.id, s])), [sortedStores]);

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  /**
   * [INP/UX] measureElement 도입 — 실제 행 높이로 totalSize 보정 → 스크롤바 thumb·sentinel 정확도↑.
   */
  const listRowVirtualizer = useVirtualizer({
    count: loading && sortedStores.length === 0 ? 0 : sortedStores.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => STORE_SHEET_VIRTUAL_ROW_EST_PX,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height
  });

  const mapStores = useMemo(() => {
    if (!selectedStore) return sortedStores;
    if (sortedStores.some((s) => s.id === selectedStore.id)) return sortedStores;
    return [selectedStore, ...sortedStores];
  }, [sortedStores, selectedStore]);

  const detailAugmenting = useStoreDetailAugment(
    sheetView,
    selectedStore,
    center,
    setSelectedStore
  );

  const onPrefetchStore = useCallback((row: StoreData) => prefetchStoreDetail(row.id, center), [center]);

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
        setStores([]);
        setTotal(0);
        setHasMore(false);
        setOffset(0);
        setErrorMsg(null);
      }
      try {
        /**
         * lat/lng 미전송 — 서버는 name 정렬·distance 미포함 응답으로 통일.
         * 거리 정렬·distance 표시는 sortedStores 가 사용자 위치 기준으로 클라이언트에서 수행.
         * 이로써 (regionPath, filter, offset, limit) 만이 캐시 키 → s-maxage=600 CDN hit ~100%.
         */
        const data = await fetchRegionStores({
          regionPath,
          category,
          offset: startOffset,
          limit: 40
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
    /* geoLat/geoLng 의존 제거 — 위치 권한 변동만으로는 재 fetch 가 발생하지 않는다. */
    [regionPath, category]
  );

  const onLoadMore = useCallback(() => {
    if (loading || loadingMore) return;
    void runReload(offset, true);
  }, [loading, loadingMore, offset, runReload]);

  useEffect(() => {
    /**
     * SSR initialPayload 로 이미 첫 페이지 데이터가 채워져 있으면 첫 fetch 1회 skip.
     * 이후 category 변경(runReload 재생성) 부터는 정상 수행.
     */
    if (initialFetchSkipRef.current) {
      initialFetchSkipRef.current = false;
      return;
    }
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
      /** 마커만 선택 — 지도 중심/줌은 유지 (리스트·검색 탭은 handleSelect* 에서만 pan). */
      setSelectedStore(resolved);
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

  const panMapToUserLocation = useCallback(() => {
    setSelectedStore(null);
    setSheetView("list");
    setMapCenterOverride(null);
    if (userLocation) {
      setManualCenter(userLocation);
      setCenterVersion((v) => v + 1);
    }
  }, [userLocation]);

  const handleMoveToLocation = useCallback(() => {
    sendGtagEvent("click_my_location", { page: "region" });
    panMapToUserLocation();
    if (permission === "granted") {
      moveToUserAfterLocationRef.current = !userLocation;
      requestLocation({ silent: !!userLocation });
      return;
    }
    moveToUserAfterLocationRef.current = true;
    requestLocation();
    setLocationModalOpen(true);
  }, [permission, panMapToUserLocation, requestLocation, userLocation]);

  useEffect(() => {
    if (!moveToUserAfterLocationRef.current) return;
    if (permission !== "granted" || !userLocation) return;
    setManualCenter(userLocation);
    setCenterVersion((v) => v + 1);
    moveToUserAfterLocationRef.current = false;
  }, [permission, userLocation]);

  useEffect(() => {
    if (permission !== "requesting") {
      setShowGeoProgressUi(false);
      return;
    }
    const t = window.setTimeout(() => setShowGeoProgressUi(true), 200);
    return () => window.clearTimeout(t);
  }, [permission]);

  /**
   * 변경 전: 모달 grant 직후 requestLocation 만 호출 → mapCenterOverride 가 살아 있으면
   *          center 우선순위 (override ?? geo ?? manual) 에 의해 위치로 이동하지 않음.
   * 변경 후: grant 직전 selectedStore/sheetView/mapCenterOverride 를 reset 하고,
   *          이미 위치를 가지고 있다면 manualCenter 도 즉시 갱신 + centerVersion 증가.
   *          UI 동일 (모달은 사용자가 명시적으로 띄운 상태).
   */
  const handleLocationPermissionAllow = useCallback(() => {
    setLocationModalOpen(false);
    panMapToUserLocation();
    moveToUserAfterLocationRef.current = true;
    void syncBrowserPermission();
    requestLocation();
  }, [panMapToUserLocation, requestLocation, syncBrowserPermission]);

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

  /**
   * [CLS] loading↔결과 토글, errorMsg 등장/소멸 시 위쪽 한 줄이 추가되며 아래 리스트를 밀어냈음.
   * 변경 후: 카운트 줄(min-h-[20px])과 에러 줄(min-h-[18px]) 모두 컨테이너 높이를 미리 예약.
   * UI: 동일 문구, 동일 위치 — 영역만 안정화.
   */
  const listStatsSlot = (
    <div className="shrink-0 pb-2 pt-4">
      <div className="min-h-[20px]">
        {!loading ? (
          <p className="pl-2 text-[14px] tracking-[0.1px] text-black">
            <span className="font-normal">총 </span>
            <span className="font-bold tabular-nums">{total}</span>
            <span className="font-normal">건</span>
          </p>
        ) : (
          <p className="pl-2 text-[14px] font-normal text-[#999]">불러오는 중…</p>
        )}
      </div>
      <div className="min-h-[18px] pt-2">
        {errorMsg ? <p className="pl-2 text-[13px] text-danger-700">{errorMsg}</p> : null}
      </div>
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
      <LocationRequestingOverlay visible={showGeoProgressUi} zClassName="z-[62]" />
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

          {/**
           * [INP] 변경 전: sheetView 토글마다 fullscreen list 영역 + virtualizer + 60+ DOM 행이
           *   unmount/mount → 인터랙션 직후 next-paint INP 폭증.
           * 변경 후: 항상 mount, sheetView !== "list" 일 때 visibility:hidden + pointer-events-none.
           */}
          <div
            className={`pointer-events-auto fixed inset-0 z-[60] flex justify-center bg-white ${
              sheetView !== "list" ? "pointer-events-none invisible" : ""
            }`}
            aria-hidden={sheetView !== "list"}
          >
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
                    {loading && sortedStores.length === 0 ? (
                                            <RegionStoreListRowSkeletons />
                    ) : sortedStores.length === 0 ? (
                      <div className="min-h-[40vh]">{emptyListSlot}</div>
                    ) : (
                      <>
                        <div className="relative w-full" style={{ height: listRowVirtualizer.getTotalSize() }}>
                          {listRowVirtualizer.getVirtualItems().map((vi) => {
                            const row = sortedStores[vi.index];
                            return (
                              <div
                                key={vi.key}
                                data-index={vi.index}
                                ref={listRowVirtualizer.measureElement}
                                className="absolute left-0 top-0 w-full"
                                style={{ transform: `translateY(${vi.start}px)` }}
                              >
                                <StoreSheetVirtualRow
                                  store={row}
                                  selected={selectedStore?.id === row.id}
                                  index={vi.index}
                                  total={sortedStores.length}
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

          <LocationPermissionModal
            open={locationModalOpen}
            blocked={geolocationBlocked}
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

          {/**
           * [INP] selectedStore 가 한 번이라도 있으면 DetailSheet 를 mount 한 상태로 유지,
           * sheetView !== "detail" 일 때 visibility 만 끔. 두 번째 마커 클릭부터는 prop 갱신만.
           */}
          {selectedStore ? (
            <div
              className={sheetView !== "detail" ? "pointer-events-none invisible" : ""}
              aria-hidden={sheetView !== "detail"}
            >
              <StoreDetailSheet
                store={selectedStore}
                onClose={handleCloseDetailSheet}
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
