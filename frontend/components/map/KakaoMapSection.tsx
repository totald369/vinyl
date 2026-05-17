"use client";

/**
 * 카카오 지도 베이스 + 단순 마커 레이어(홈 과거 패턴 호환용).
 */
import { useEffect, useRef, useState } from "react";
import "@/lib/kakao";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { createKakaoMap, relayoutKakaoMap } from "@/lib/kakao/createKakaoMap";
import {
  CLUSTER_MIN_MARKERS,
  syncMarkersWithClusterer,
  type MarkerClustererLike
} from "@/lib/kakao/markerCluster";
import { DEFAULT_REGION, LatLng, StoreItem } from "@/lib/types";
import type { KakaoMarker } from "@/lib/kakao";

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
  const markersByIdRef = useRef<Map<string, KakaoMarker>>(new Map());
  const clustererRef = useRef<MarkerClustererLike | null>(null);
  const onMapIdleRef = useRef(onMapIdle);
  onMapIdleRef.current = onMapIdle;

  const [mapError, setMapError] = useState<string | null>(null);
  const { isLoading, isReady, error } = useKakaoMapLoader();

  useEffect(() => {
    if (!containerRef.current || !isReady || !window.kakao?.maps) return;
    if (mapRef.current) return;

    const markersForUnmount = markersByIdRef.current;

    let idleListenerCb: ((...args: unknown[]) => void) | null = null;
    try {
      const kakaoCenter = new window.kakao.maps.LatLng(
        center.lat ?? DEFAULT_REGION.lat,
        center.lng ?? DEFAULT_REGION.lng
      );
      const map = createKakaoMap(containerRef.current, {
        center: kakaoCenter,
        level: 4
      });
      mapRef.current = map;
      requestAnimationFrame(() => relayoutKakaoMap(map));

      idleListenerCb = () => {
        const mapCenter = map.getCenter();
        const mapBounds = map.getBounds();
        const sw = mapBounds.getSouthWest();
        const ne = mapBounds.getNorthEast();
        onMapIdleRef.current?.({
          center: { lat: mapCenter.getLat(), lng: mapCenter.getLng() },
          bounds: {
            swLat: sw.getLat(),
            swLng: sw.getLng(),
            neLat: ne.getLat(),
            neLng: ne.getLng()
          }
        });
      };

      window.kakao.maps.event.addListener(map, "idle", idleListenerCb as never);
    } catch (initError) {
      setMapError(initError instanceof Error ? initError.message : "지도 초기화 오류");
      return undefined;
    }

    return () => {
      const map = mapRef.current;
      if (map && idleListenerCb) {
        try {
          window.kakao.maps.event.removeListener(map as never, "idle", idleListenerCb as never);
        } catch {
          /* ignore */
        }
      }
      clustererRef.current?.clear?.();
      clustererRef.current?.setMap?.(null);
      clustererRef.current = null;
      markersForUnmount.forEach((m) => m.setMap(null));
      markersForUnmount.clear();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 지도 인스턴스는 isReady 후 1회만 생성
  }, [isReady]);

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

    const nextIds = new Set(stores.map((s) => s.id));
    for (const [id, marker] of markersByIdRef.current) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        markersByIdRef.current.delete(id);
      }
    }

    const markerList: KakaoMarker[] = [];
    for (const store of stores) {
      let marker = markersByIdRef.current.get(store.id);
      const pos = new window.kakao.maps.LatLng(store.lat, store.lng);
      if (!marker) {
        marker = new window.kakao.maps.Marker({ position: pos, clickable: true });
        markersByIdRef.current.set(store.id, marker);
      } else {
        marker.setPosition(pos);
      }
      markerList.push(marker);
    }

    const useCluster = stores.length >= CLUSTER_MIN_MARKERS;
    syncMarkersWithClusterer(map, clustererRef, markerList, useCluster, { minLevel: 10 });
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
        <div ref={containerRef} className="kakao-map-root h-full w-full" />
      )}
    </section>
  );
}
