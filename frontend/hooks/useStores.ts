"use client";

import { useEffect, useMemo, useState } from "react";
import { parseSearchTokens, textMatchesAllTokens } from "@/lib/searchTokens";
import type { StoreData } from "@/lib/storeData";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

const LIST_RADIUS_KM = 2;

export type StoreListFilter = "payBag" | "nonBurnable" | "largeSticker";

/** 구 단위 SEO 페이지: 주소 키워드로 한정하고, 구 중심 기준 거리순(반경 제한 선택) */
export type DistrictListScope = {
  addressContains: string;
  sortFrom: LatLng;
  /** 미지정·null 이면 반경 제한 없음(전 구간) */
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
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function useStores(
  userLocation: LatLng | null,
  options?: {
    activeFilter: StoreListFilter;
    listReference?: LatLng | null;
    districtScope?: DistrictListScope | null;
    /** 구 SEO 페이지일 때만 설정 — API에서 해당 구 매장만 로드 */
    districtSlug?: string;
    /** 검색 오버레이 입력값(홈·구 공통). 비어 있으면 반경 API 사용 */
    searchQuery?: string;
  }
) {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  /** 구 페이지는 검색 입력으로 API를 다시 부르지 않고(클라이언트 필터만), 홈은 반경/검색에 따라 재요청 */
  const fetchDepsKey = useMemo(() => {
    if (districtSlug && districtScope) {
      return `district:${districtSlug}:${districtScope.sortFrom.lat}:${districtScope.sortFrom.lng}`;
    }
    return `home:${fetchCenter.lat}:${fetchCenter.lng}:q:${debouncedSearch}`;
  }, [
    districtSlug,
    districtScope?.sortFrom.lat,
    districtScope?.sortFrom.lng,
    fetchCenter.lat,
    fetchCenter.lng,
    debouncedSearch
  ]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("lat", String(fetchCenter.lat));
    params.set("lng", String(fetchCenter.lng));

    if (districtSlug && districtScope) {
      params.set("district", districtSlug);
    } else if (debouncedSearch) {
      params.set("q", debouncedSearch);
    } else {
      params.set("radiusKm", String(LIST_RADIUS_KM));
    }

    fetch(`/api/stores?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`매장 데이터를 불러오지 못했습니다 (${res.status})`);
        return res.json() as Promise<{ stores: StoreData[] }>;
      })
      .then((data) => {
        if (!mounted) return;
        const rows = Array.isArray(data.stores) ? data.stores : [];
        setStores(rows);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "데이터 로드 오류");
        setStores([]);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [fetchDepsKey]);

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
    const maxRadiusKm =
      ds != null
        ? ds.listRadiusKm == null
          ? Number.POSITIVE_INFINITY
          : ds.listRadiusKm
        : LIST_RADIUS_KM;

    return [...stores]
      .map((store) => ({
        ...store,
        distance: haversineKm(referencePoint, { lat: store.lat, lng: store.lng })
      }))
      .filter((store) => {
        if (!addrTokens.length) return true;
        const blob = `${store.roadAddress ?? ""} ${store.address ?? ""}`.toLowerCase();
        return textMatchesAllTokens(blob, addrTokens);
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
    userLocation
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
    error
  };
}
