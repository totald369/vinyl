"use client";

import { useEffect, useRef } from "react";
import { StoreData } from "@/hooks/useStores";
import type { KakaoMap, KakaoMarker } from "@/lib/kakao";
import { LatLng } from "@/lib/types";

type Props = {
  center: LatLng;
  stores: StoreData[];
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  /** 실제 GPS 허용 시에만 전달 — 강남 fallback 좌표는 넣지 않음 */
  userMarkerPosition?: LatLng | null;
};

const USER_MARKER_SRC = "/Img/Icon/User_marker.svg";
const USER_MARKER_SIZE = 64;

/** 종량제 봉투 판매처 매장 마커 */
const STORE_MARKER_SRC = "/Img/Icon/trash_bag_80.svg";
const STORE_MARKER_SELECTED_SRC = "/Img/Icon/trash_bag_80_selected.svg";
const STORE_MARKER_SIZE = 80;

export default function MapView({
  center,
  stores,
  selectedStoreId,
  onSelectStore,
  userMarkerPosition = null
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerMapRef = useRef<Map<string, KakaoMarker>>(new Map());
  const userMarkerRef = useRef<KakaoMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof window === "undefined") return;
    if (!window.kakao?.maps) return;

    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(Number(center.lat), Number(center.lng)),
        level: 5
      });
    }
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;

    mapRef.current.setCenter(new window.kakao.maps.LatLng(Number(center.lat), Number(center.lng)));
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    markerMapRef.current.forEach((marker) => marker.setMap(null));
    markerMapRef.current.clear();

    const kakao = window.kakao.maps;
    const storeSize = new kakao.Size(STORE_MARKER_SIZE, STORE_MARKER_SIZE);
    const storeOffset = new kakao.Point(STORE_MARKER_SIZE / 2, STORE_MARKER_SIZE / 2);
    const storeImageNormal = new kakao.MarkerImage(STORE_MARKER_SRC, storeSize, { offset: storeOffset });
    const storeImageSelected = new kakao.MarkerImage(STORE_MARKER_SELECTED_SRC, storeSize, {
      offset: storeOffset
    });

    stores.forEach((store) => {
      const lat = Number(store.lat);
      const lng = Number(store.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const isSelected = selectedStoreId != null && store.id === selectedStoreId;
      const marker = new kakao.Marker({
        map,
        position: new kakao.LatLng(lat, lng),
        image: isSelected ? storeImageSelected : storeImageNormal,
        zIndex: isSelected ? 100 : 1
      });
      markerMapRef.current.set(store.id, marker);

      window.kakao.maps.event.addListener(marker, "click", () => {
        onSelectStore(store);
      });
    });
  }, [stores, onSelectStore, selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId) return;
    if (!mapRef.current || !window.kakao?.maps) return;

    const selectedMarker = markerMapRef.current.get(selectedStoreId);
    if (selectedMarker && typeof selectedMarker.getPosition === "function") {
      mapRef.current.panTo(selectedMarker.getPosition());
    }
  }, [selectedStoreId]);

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
