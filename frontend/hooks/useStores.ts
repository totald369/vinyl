"use client";

import { useEffect, useMemo, useState } from "react";
import { pickDataReferenceDateFromRow } from "@/lib/datasetDate";
import { DEFAULT_REGION, LatLng } from "@/lib/types";
const LIST_RADIUS_KM = 2;

export type StoreCategory = "payBag" | "nonBurnable";
export type StoreListFilter = "payBag" | "largeSticker" | "nonBurnable";

export type StoreData = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress?: string;
  /** `data/stores.json` 등 roadAddress 대신 쓰는 소스 */
  address?: string;
  businessStatus?: string;
  largeWasteStickerYn?: "Y" | "N";
  storeCategory?: StoreCategory;
  /** 관리자가 판매 여부를 확인한 경우에만 true (JSON `adminVerified` 또는 Supabase 연동 시 사용) */
  adminVerified?: boolean;
  /** 공공데이터 데이터기준일자 등 (행 단위 또는 env `NEXT_PUBLIC_STORE_DATA_REFERENCE_DATE`) */
  dataReferenceDate?: string;
  distance?: number;
};

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

function normalizeCategory(row: StoreData): StoreCategory {
  if (row.storeCategory === "nonBurnable" || row.storeCategory === "payBag") {
    return row.storeCategory;
  }
  const sid = Number.parseInt(String(row.id), 10);
  if (Number.isFinite(sid)) {
    return sid % 2 === 1 ? "payBag" : "nonBurnable";
  }
  return "payBag";
}

export function useStores(
  userLocation: LatLng | null,
  options?: { activeFilter: StoreListFilter }
) {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch("/data/stores.sample.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("stores.sample.json 로드 실패");
        }
        return res.json();
      })
      .then((rows: StoreData[]) => {
        if (!mounted) return;

        const cleaned = rows
          .map((row) => {
            const r = row as StoreData & Record<string, unknown>;
            const fromJson =
              typeof row.dataReferenceDate === "string" && row.dataReferenceDate.trim()
                ? row.dataReferenceDate.trim()
                : "";
            return {
              ...row,
              roadAddress: row.roadAddress ?? row.address ?? "",
              lat: Number(row.lat),
              lng: Number(row.lng),
              largeWasteStickerYn: row.largeWasteStickerYn === "Y" ? ("Y" as const) : ("N" as const),
              storeCategory: normalizeCategory(row),
              adminVerified: row.adminVerified === true,
              dataReferenceDate: fromJson || pickDataReferenceDateFromRow(r)
            };
          })
          .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));

        setStores(cleaned);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "데이터 로드 오류");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const sortedStores = useMemo(() => {
    if (!stores.length) return [];

    const referencePoint = userLocation ?? {
      lat: DEFAULT_REGION.lat,
      lng: DEFAULT_REGION.lng
    };

    const filter = options?.activeFilter ?? "payBag";

    return [...stores]
      .map((store) => ({
        ...store,
        distance: haversineKm(referencePoint, { lat: store.lat, lng: store.lng })
      }))
      .filter((store) => {
        if (filter === "largeSticker") {
          return store.largeWasteStickerYn === "Y";
        }
        if (filter === "nonBurnable") {
          return store.storeCategory === "nonBurnable";
        }
        return store.storeCategory === "payBag";
      })
      .filter((store) => (store.distance ?? Infinity) <= LIST_RADIUS_KM)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }, [options?.activeFilter, stores, userLocation]);

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
