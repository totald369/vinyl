"use client";

import { useEffect, useMemo, useState } from "react";
import { dedupeStoresByNameAndLocation } from "@/lib/dedupeStores";
import { pickDataReferenceDateFromRow } from "@/lib/datasetDate";
import { DEFAULT_REGION, LatLng } from "@/lib/types";
const LIST_RADIUS_KM = 2;

export type StoreListFilter = "payBag" | "largeSticker" | "nonBurnable";

export type StoreData = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress?: string;
  address?: string;
  businessStatus?: string;
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
  adminVerified?: boolean;
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

type RawStoreRow = {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  roadAddress?: string;
  address?: string;
  businessStatus?: string;
  largeWasteStickerYn?: string;
  storeCategory?: string;
  adminVerified?: boolean;
  dataReferenceDate?: string;
  hasTrashBag?: boolean;
  hasSpecialBag?: boolean;
  hasLargeWasteSticker?: boolean;
} & Record<string, unknown>;

function normalizeRow(raw: RawStoreRow): StoreData {
  const hasTrashBag =
    raw.hasTrashBag === true || raw.storeCategory === "payBag";
  const hasSpecialBag =
    raw.hasSpecialBag === true || raw.storeCategory === "nonBurnable";
  const hasLargeWasteSticker =
    raw.hasLargeWasteSticker === true || raw.largeWasteStickerYn === "Y";

  const fromJson =
    typeof raw.dataReferenceDate === "string" && raw.dataReferenceDate.trim()
      ? raw.dataReferenceDate.trim()
      : "";

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    roadAddress: raw.roadAddress ?? raw.address ?? "",
    address: raw.address ?? "",
    businessStatus: raw.businessStatus,
    hasTrashBag,
    hasSpecialBag,
    hasLargeWasteSticker,
    adminVerified: raw.adminVerified === true,
    dataReferenceDate: fromJson || pickDataReferenceDateFromRow(raw)
  };
}

export function useStores(
  userLocation: LatLng | null,
  options?: { activeFilter: StoreListFilter; listReference?: LatLng | null }
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
      .then((rows: RawStoreRow[]) => {
        if (!mounted) return;

        const cleaned = dedupeStoresByNameAndLocation(
          rows
            .map(normalizeRow)
            .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
        );

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

    const referencePoint =
      options?.listReference ??
      userLocation ?? {
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
        if (filter === "largeSticker") return store.hasLargeWasteSticker;
        if (filter === "nonBurnable") return store.hasSpecialBag;
        return store.hasTrashBag;
      })
      .filter((store) => (store.distance ?? Infinity) <= LIST_RADIUS_KM)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }, [options?.activeFilter, options?.listReference, stores, userLocation]);

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
