"use client";

import { useEffect, useRef, useState } from "react";
import "@/lib/kakao";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { DEFAULT_REGION, LatLng, StoreItem } from "@/lib/types";

type Props = {
  center: LatLng;
  stores: StoreItem[];
  onMapIdle: (payload: {
    center: LatLng;
    bounds: { swLat: number; swLng: number; neLat: number; neLng: number };
  }) => void;
};

export default function KakaoMapSection({ center, stores, onMapIdle }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("@/lib/kakao").KakaoMap | null>(null);
  const markersRef = useRef<Array<{ setMap: (map: import("@/lib/kakao").KakaoMap | null) => void }>>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const { isLoading, isReady, error } = useKakaoMapLoader();

  useEffect(() => {
    if (!containerRef.current || !isReady || !window.kakao?.maps) return;

    let mounted = true;
    try {
      const kakaoCenter = new window.kakao.maps.LatLng(
        center.lat ?? DEFAULT_REGION.lat,
        center.lng ?? DEFAULT_REGION.lng
      );
      const map = new window.kakao.maps.Map(containerRef.current, {
        center: kakaoCenter,
        level: 4
      });
      mapRef.current = map;

      window.kakao.maps.event.addListener(map, "idle", () => {
        const mapCenter = map.getCenter();
        const mapBounds = map.getBounds();
        const sw = mapBounds.getSouthWest();
        const ne = mapBounds.getNorthEast();
        onMapIdle({
          center: { lat: mapCenter.getLat(), lng: mapCenter.getLng() },
          bounds: {
            swLat: sw.getLat(),
            swLng: sw.getLng(),
            neLat: ne.getLat(),
            neLng: ne.getLng()
          }
        });
      });
      console.info("[KakaoMap] map initialized (KakaoMapSection)");
    } catch (initError) {
      if (mounted) {
        console.error("[KakaoMap] map initialization failed (KakaoMapSection)", initError);
        setMapError(initError instanceof Error ? initError.message : "지도 초기화 오류");
      }
    }

    return () => {
      mounted = false;
      markersRef.current.forEach((marker) => marker.setMap(null));
    };
  }, [center.lat, center.lng, isReady, onMapIdle]);

  useEffect(() => {
    if (!error) return;
    setMapError(error);
  }, [error]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = stores.map((store) => {
      return new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(store.lat, store.lng)
      });
    });
  }, [stores]);

  return (
    <section className="h-full w-full">
      {mapError ? (
        <div className="flex h-full items-center justify-center bg-danger-50 text-body-sm text-danger-700">
          {mapError}
        </div>
      ) : isLoading ? (
        <div className="flex h-full items-center justify-center bg-bg-muted text-body-sm text-text-secondary">
          지도를 불러오는 중입니다...
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}
    </section>
  );
}
