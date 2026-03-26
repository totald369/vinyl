"use client";

import { useCallback, useEffect, useRef } from "react";
import { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { KakaoMap, KakaoMarker } from "@/lib/kakao";
import { LatLng } from "@/lib/types";

type Props = {
  center: LatLng;
  centerVersion?: number;
  stores: StoreData[];
  activeFilter: StoreListFilter;
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  userMarkerPosition?: LatLng | null;
};

const USER_MARKER_SRC = "/Img/Icon/User_marker.svg";
const USER_MARKER_SIZE = 64;

const FILTER_MARKER_MAP: Record<StoreListFilter, { src: string; selectedSrc: string; size: number }> = {
  payBag: {
    src: "/Img/Icon/trash_bag_80.svg",
    selectedSrc: "/Img/Icon/trash_bag_80_selected.svg",
    size: 80
  },
  largeSticker: {
    src: "/Img/Icon/sticker_80.svg",
    selectedSrc: "/Img/Icon/sticker_80_selected.svg",
    size: 80
  },
  nonBurnable: {
    src: "/Img/Icon/non-fire_80.svg",
    selectedSrc: "/Img/Icon/non-fire_80_selected.svg",
    size: 80
  }
};

export default function MapView({
  center,
  centerVersion = 0,
  stores,
  activeFilter,
  selectedStoreId,
  onSelectStore,
  userMarkerPosition = null
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerMapRef = useRef<Map<string, KakaoMarker>>(new Map());
  const userMarkerRef = useRef<KakaoMarker | null>(null);
  const prevCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevCenterVersionRef = useRef(0);
  const prevSelectedIdRef = useRef<string | null>(null);
  const activeFilterRef = useRef<StoreListFilter>(activeFilter);
  activeFilterRef.current = activeFilter;

  const onSelectStoreRef = useRef(onSelectStore);
  onSelectStoreRef.current = onSelectStore;

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined" || !window.kakao?.maps) return;
    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(Number(center.lat), Number(center.lng)),
        level: 5
      });
      prevCenterRef.current = { lat: Number(center.lat), lng: Number(center.lng) };
    }
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    if (
      centerVersion === prevCenterVersionRef.current &&
      prevCenterRef.current &&
      prevCenterRef.current.lat === lat &&
      prevCenterRef.current.lng === lng
    ) {
      return;
    }
    prevCenterRef.current = { lat, lng };
    prevCenterVersionRef.current = centerVersion;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
  }, [center.lat, center.lng, centerVersion]);

  const buildMarkerImages = useCallback((filter: StoreListFilter) => {
    const kakao = window.kakao.maps;
    const meta = FILTER_MARKER_MAP[filter];
    const size = new kakao.Size(meta.size, meta.size);
    const offset = new kakao.Point(meta.size / 2, meta.size / 2);
    return {
      normal: new kakao.MarkerImage(meta.src, size, { offset }),
      selected: new kakao.MarkerImage(meta.selectedSrc, size, { offset })
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    markerMapRef.current.forEach((marker) => marker.setMap(null));
    markerMapRef.current.clear();
    prevSelectedIdRef.current = null;

    const kakao = window.kakao.maps;
    const images = buildMarkerImages(activeFilter);

    stores.forEach((store) => {
      const lat = Number(store.lat);
      const lng = Number(store.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const isSelected = selectedStoreId != null && store.id === selectedStoreId;
      const marker = new kakao.Marker({
        map,
        position: new kakao.LatLng(lat, lng),
        image: isSelected ? images.selected : images.normal,
        zIndex: isSelected ? 100 : 1
      });
      markerMapRef.current.set(store.id, marker);

      if (isSelected) {
        prevSelectedIdRef.current = store.id;
      }

      kakao.event.addListener(marker, "click", () => {
        console.debug("[MapView] marker clicked, store id:", store.id);
        onSelectStoreRef.current(store);
      });
    });
    // selectedStoreId is intentionally excluded — selection visual is handled separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, stores, buildMarkerImages]);

  useEffect(() => {
    if (!window.kakao?.maps) return;

    const prevId = prevSelectedIdRef.current;
    const newId = selectedStoreId ?? null;

    if (prevId === newId) return;

    console.debug("[MapView] selection changed:", prevId, "→", newId, "(NO map movement)");

    const images = buildMarkerImages(activeFilterRef.current);

    if (prevId) {
      const prevMarker = markerMapRef.current.get(prevId);
      if (prevMarker) {
        prevMarker.setImage(images.normal);
        prevMarker.setZIndex(1);
      }
    }

    if (newId) {
      const newMarker = markerMapRef.current.get(newId);
      if (newMarker) {
        newMarker.setImage(images.selected);
        newMarker.setZIndex(100);
      }
    }

    prevSelectedIdRef.current = newId;
  }, [selectedStoreId, buildMarkerImages]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;

    const map = mapRef.current;
    const kakao = window.kakao.maps;

    if (!userMarkerPosition) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null);
        userMarkerRef.current = null;
      }
      return;
    }

    const lat = Number(userMarkerPosition.lat);
    const lng = Number(userMarkerPosition.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const position = new kakao.LatLng(lat, lng);
    const size = new kakao.Size(USER_MARKER_SIZE, USER_MARKER_SIZE);
    const offset = new kakao.Point(USER_MARKER_SIZE / 2, USER_MARKER_SIZE / 2);
    const image = new kakao.MarkerImage(USER_MARKER_SRC, size, { offset });

    if (!userMarkerRef.current) {
      userMarkerRef.current = new kakao.Marker({
        map,
        position,
        image,
        zIndex: 200
      });
    } else {
      userMarkerRef.current.setPosition(position);
      if (typeof userMarkerRef.current.setZIndex === "function") {
        userMarkerRef.current.setZIndex(200);
      }
    }
  }, [userMarkerPosition]);

  return <div ref={containerRef} className="h-full w-full" />;
}
