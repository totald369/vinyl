"use client";

/**
 * 매장 목록 패칭 훅 (/api/stores 연동).
 *
 * 변경 전: 같은 URL도 매번 로딩 스피너 + 전량 fetch, 지도 이동 시 요청 폭주.
 * 변경 후: 동일 쿼리키 60초 LRU + in-flight 디듀프 + AbortController로 교체,
 *          캐시 히트 시 즉시 렌더 후 백그라운드 SWR 갱신,
 *          반경 모드만 지도 중심 200ms 디바운스로 idle 후 트리거 감소.
 * 측정: Network 탭 요청 수·중복률, 검색/지도 이동 후 목록 표시까지 시간(ms),
 *       sortedStores에서 불필요한 haversine 재계산 제거 시 메인 스레드 시간.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { expandProvinceAliasesForSearch } from "@/lib/koreaProvinceAliases";
import { parseSearchTokens, precomputeHangulTokens, textMatchesAllTokens } from "@/lib/searchTokens";
import type { StoreData } from "@/lib/storeData";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

/** 변경 전 100 → 변경 후 30: 페이지 크기 축소로 페이로드 감소, 무한스크롤로 보충 */
export const SEARCH_PAGE_SIZE = 30;

const LIST_RADIUS_KM = 2;

export type StoreListFilter = "payBag" | "nonBurnable" | "largeSticker";

export type DistrictListScope = {
  addressContains: string;
  sortFrom: LatLng;
  listRadiusKm?: number | null;
};

export type { StoreData };

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(from: LatLng, to: LatLng) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    if (ms <= 0) {
      setD(value);
      return;
    }
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return ms <= 0 ? value : d;
}

type CachedPayload = {
  stores: StoreData[];
  total?: number;
  hasMore?: boolean;
};

type FlightEntry = {
  ts: number;
  data?: CachedPayload;
  promise?: Promise<CachedPayload>;
};

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_KEYS = 64;
const flightCache = new Map<string, FlightEntry>();

function touchCache(key: string, e: FlightEntry) {
  flightCache.delete(key);
  flightCache.set(key, e);
  while (flightCache.size > MAX_CACHE_KEYS) {
    const first = flightCache.keys().next().value as string | undefined;
    if (first === undefined) break;
    flightCache.delete(first);
  }
}

async function fetchStoresPayload(url: string, signal: AbortSignal): Promise<CachedPayload> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`매장 데이터를 불러오지 못했습니다 (${res.status})`);
  const data = (await res.json()) as {
    stores: StoreData[];
    total?: number;
    hasMore?: boolean;
  };
  return {
    stores: Array.isArray(data.stores) ? data.stores : [],
    total: typeof data.total === "number" ? data.total : undefined,
    hasMore: typeof data.hasMore === "boolean" ? data.hasMore : undefined
  };
}

function coordsMatch(a: LatLng, b: LatLng, eps = 1e-5): boolean {
  return Math.abs(a.lat - b.lat) < eps && Math.abs(a.lng - b.lng) < eps;
}

export function useStores(
  userLocation: LatLng | null,
  options?: {
    activeFilter: StoreListFilter;
    listReference?: LatLng | null;
    districtScope?: DistrictListScope | null;
    districtSlug?: string;
    searchQuery?: string;
    /**
     * 서버 prefetch 결과(DEFAULT_REGION 기준). 첫 렌더 시 빈 배열 대신 사용해
     * 빈 화면 지속 시간을 줄임. 사용자 위치가 잡히는 즉시 useStores 가 자체 fetch 로 갱신.
     */
    initialStores?: StoreData[];
  }
) {
  const initialStoresProp = options?.initialStores;
  const initialFromServer = useMemo(
    () => (Array.isArray(initialStoresProp) ? initialStoresProp : []),
    [initialStoresProp]
  );
  const hasInitialServerStoresRef = useRef(initialFromServer.length > 0);
  const [stores, setStores] = useState<StoreData[]>(initialFromServer);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(initialFromServer.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const searchFetchGen = useRef(0);
  const mainAbortRef = useRef<AbortController | null>(null);

  const searchQuery = options?.searchQuery ?? "";
  const debouncedSearch = useDebounced(searchQuery.trim(), 320);

  const districtSlug = options?.districtSlug;
  const districtScope = options?.districtScope;

  const listRef = options?.listReference ?? null;

  const fetchCenter = useMemo((): LatLng => {
    if (districtSlug && districtScope) {
      return districtScope.sortFrom;
    }
    return (
      listRef ??
      userLocation ?? {
        lat: DEFAULT_REGION.lat,
        lng: DEFAULT_REGION.lng
      }
    );
  }, [
    districtSlug,
    districtScope,
    listRef?.lat,
    listRef?.lng,
    userLocation?.lat,
    userLocation?.lng
  ]);

  const isRadiusMode = !districtSlug && !debouncedSearch;
  const debouncedRadiusCenter = useDebounced(fetchCenter, isRadiusMode ? 200 : 0);

  const centerForFetch =
    districtSlug || debouncedSearch ? fetchCenter : debouncedRadiusCenter;

  const fetchDepsKey = useMemo(() => {
    if (districtSlug && districtScope) {
      return `district:${districtSlug}:${districtScope.sortFrom.lat}:${districtScope.sortFrom.lng}`;
    }
    if (debouncedSearch) {
      const f = options?.activeFilter ?? "payBag";
      return `search:${fetchCenter.lat}:${fetchCenter.lng}:q:${debouncedSearch}:f:${f}`;
    }
    return `home:${centerForFetch.lat}:${centerForFetch.lng}:radius`;
  }, [
    districtSlug,
    districtScope?.sortFrom.lat,
    districtScope?.sortFrom.lng,
    fetchCenter.lat,
    fetchCenter.lng,
    centerForFetch.lat,
    centerForFetch.lng,
    debouncedSearch,
    options?.activeFilter
  ]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("lat", String(centerForFetch.lat));
    params.set("lng", String(centerForFetch.lng));

    if (districtSlug && districtScope) {
      params.set("district", districtSlug);
    } else if (debouncedSearch) {
      params.set("q", debouncedSearch);
      params.set("offset", "0");
      params.set("limit", String(SEARCH_PAGE_SIZE));
      params.set("filter", options?.activeFilter ?? "payBag");
    } else {
      params.set("radiusKm", String(LIST_RADIUS_KM));
    }
    return `/api/stores?${params.toString()}`;
  }, [
    centerForFetch.lat,
    centerForFetch.lng,
    debouncedSearch,
    districtScope,
    districtSlug,
    options?.activeFilter
  ]);

  useEffect(() => {
    mainAbortRef.current?.abort();
    const ac = new AbortController();
    mainAbortRef.current = ac;

    const gen = ++searchFetchGen.current;
    setError(null);
    setSearchLoadingMore(false);
    if (debouncedSearch) {
      setSearchTotal(0);
      setSearchHasMore(false);
    } else {
      setSearchTotal(0);
      setSearchHasMore(false);
    }

    /**
     * 서버 prefetch 결과가 있는 첫 실행에서는 SWR 처럼 화면을 비우지 않고 백그라운드 갱신만 수행.
     * (한 번만 적용되면 충분 — flag down)
     */
    const useServerInitialThisRun = hasInitialServerStoresRef.current;
    hasInitialServerStoresRef.current = false;

    const url = listUrl;
    const perfLabel = `[perf] stores-list:${fetchDepsKey}`;
    perfTimeStart(perfLabel);

    const applyPayload = (payload: CachedPayload, g: number) => {
      if (g !== searchFetchGen.current) return;
      const rows = payload.stores;
      if (debouncedSearch) {
        setStores(rows);
        setSearchTotal(typeof payload.total === "number" ? payload.total : rows.length);
        setSearchHasMore(Boolean(payload.hasMore));
      } else {
        setStores(rows);
      }
    };

    const now = Date.now();
    const entry = flightCache.get(url);
    const fresh = entry?.data && now - entry.ts < CACHE_TTL_MS;

    /** 캐시 히트: 로딩 플래그 생략 가능 — 체감 FCP·리스트 표시 지연 감소 */
    if (fresh && entry!.data) {
      touchCache(url, entry!);
      applyPayload(entry!.data, gen);
      setLoading(false);

      const bg = new AbortController();
      void fetchStoresPayload(url, bg.signal)
        .then((payload) => {
          if (gen !== searchFetchGen.current) return;
          touchCache(url, { ts: Date.now(), data: payload });
          applyPayload(payload, gen);
          perfTimeEnd(perfLabel);
        })
        .catch(() => {
          perfTimeEnd(perfLabel);
        });

      return () => {
        ac.abort();
        bg.abort();
      };
    }

    /** in-flight 디듀프: 동일 URL 동시 요청 합류 → 네트워크 경합 감소 */
    if (entry?.promise && !entry.data) {
      setLoading(true);
      entry.promise
        .then((payload) => {
          if (gen !== searchFetchGen.current) return;
          applyPayload(payload, gen);
          setLoading(false);
          perfTimeEnd(perfLabel);
        })
        .catch((e) => {
          if ((e as Error)?.name === "AbortError") return;
          if (gen !== searchFetchGen.current) return;
          setError(e instanceof Error ? e.message : "데이터 로드 오류");
          setStores([]);
          setSearchTotal(0);
          setSearchHasMore(false);
          setLoading(false);
          perfTimeEnd(perfLabel);
        });
      return () => ac.abort();
    }

    if (!useServerInitialThisRun) {
      setLoading(true);
    }

    const p = fetchStoresPayload(url, ac.signal)
      .then((payload) => {
        touchCache(url, { ts: Date.now(), data: payload });
        return payload;
      })
      .catch((e) => {
        flightCache.delete(url);
        throw e;
      });

    touchCache(url, { ts: 0, promise: p });

    p.then((payload) => {
      touchCache(url, { ts: Date.now(), data: payload, promise: undefined });
      if (gen !== searchFetchGen.current) return;
      applyPayload(payload, gen);
      setLoading(false);
      perfTimeEnd(perfLabel);
    }).catch((e) => {
      if ((e as Error)?.name === "AbortError") return;
      if (gen !== searchFetchGen.current) return;
      setError(e instanceof Error ? e.message : "데이터 로드 오류");
      setStores([]);
      setSearchTotal(0);
      setSearchHasMore(false);
      setLoading(false);
      perfTimeEnd(perfLabel);
    });

    return () => {
      ac.abort();
    };
  }, [fetchDepsKey, listUrl, debouncedSearch]);

  const loadMoreSearchStores = useCallback(async () => {
    if (districtSlug) return;
    if (!debouncedSearch.trim()) return;
    if (searchLoadingMore || !searchHasMore) return;

    const gen = searchFetchGen.current;
    setSearchLoadingMore(true);
    const moreLabel = `[perf] stores-search-more:${stores.length}`;
    perfTimeStart(moreLabel);

    const params = new URLSearchParams();
    params.set("lat", String(fetchCenter.lat));
    params.set("lng", String(fetchCenter.lng));
    params.set("q", debouncedSearch);
    params.set("offset", String(stores.length));
    params.set("limit", String(SEARCH_PAGE_SIZE));
    params.set("filter", options?.activeFilter ?? "payBag");

    try {
      const res = await fetch(`/api/stores?${params.toString()}`);
      if (!res.ok) throw new Error(`매장 데이터를 불러오지 못했습니다 (${res.status})`);
      const data = (await res.json()) as {
        stores: StoreData[];
        mode?: string;
        hasMore?: boolean;
      };
      if (gen !== searchFetchGen.current) return;
      const rows = Array.isArray(data.stores) ? data.stores : [];
      setStores((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        const merged = [...prev];
        for (const s of rows) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            merged.push(s);
          }
        }
        return merged;
      });
      setSearchHasMore(Boolean(data.hasMore));
    } catch {
      if (gen === searchFetchGen.current) {
        setSearchHasMore(false);
      }
    } finally {
      perfTimeEnd(moreLabel);
      if (gen === searchFetchGen.current) {
        setSearchLoadingMore(false);
      }
    }
  }, [
    debouncedSearch,
    districtSlug,
    fetchCenter.lat,
    fetchCenter.lng,
    options?.activeFilter,
    searchHasMore,
    searchLoadingMore,
    stores.length
  ]);

  const sortedStores = useMemo(() => {
    if (!stores.length) return [];

    const referencePoint =
      options?.listReference ??
      userLocation ??
      options?.districtScope?.sortFrom ?? {
        lat: DEFAULT_REGION.lat,
        lng: DEFAULT_REGION.lng
      };

    const filter = options?.activeFilter ?? "payBag";
    const ds = options?.districtScope;
    const addrTokens = ds ? parseSearchTokens(ds.addressContains) : [];
    const addrHangulTokens = addrTokens.length ? precomputeHangulTokens(addrTokens) : undefined;
    const maxRadiusKm =
      ds != null
        ? ds.listRadiusKm == null
          ? Number.POSITIVE_INFINITY
          : ds.listRadiusKm
        : LIST_RADIUS_KM;

    /**
     * 서버가 distance를 내려준 경우(반경·검색·구), 기준점이 API 기준점과 같을 때
     * 클라이언트 haversine 재계산 생략 — 메인 스레드 CPU·배터리 절감.
     */
    const canReuseApiDistance =
      stores.every((s) => typeof s.distance === "number") &&
      coordsMatch(referencePoint, fetchCenter);

    return [...stores]
      .map((store) => ({
        ...store,
        distance: canReuseApiDistance
          ? (store.distance as number)
          : haversineKm(referencePoint, { lat: store.lat, lng: store.lng })
      }))
      .filter((store) => {
        if (!addrTokens.length) return true;
        const blob = expandProvinceAliasesForSearch(
          `${store.roadAddress ?? ""} ${store.address ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim()
        );
        return textMatchesAllTokens(blob, addrTokens, addrHangulTokens);
      })
      .filter((store) => {
        if (filter === "nonBurnable") return store.hasSpecialBag;
        if (filter === "largeSticker") return store.hasLargeWasteSticker;
        return store.hasTrashBag;
      })
      .filter((store) => (store.distance ?? Infinity) <= maxRadiusKm)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }, [
    options?.activeFilter,
    options?.districtScope,
    options?.listReference,
    stores,
    userLocation,
    fetchCenter.lat,
    fetchCenter.lng
  ]);

  const defaultCenter = useMemo(
    () => ({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng }),
    []
  );

  return {
    stores,
    selectedStore,
    setSelectedStore,
    userLocation,
    sortedStores,
    defaultCenter,
    loading,
    error,
    searchTotal,
    searchHasMore,
    searchLoadingMore,
    loadMoreSearchStores
  };
}
