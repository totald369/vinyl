"use client";

/**
 * 카카오 지도 베이스 + 단순 마커 레이어(홈 과거 패턴 호환용).
 *
 * 변경 전: center가 바뀔 때마다 지도 재생성, stores 바뀔 때마다 전 마커 setMap(null) 후 전량 재생성.
 * 변경 후: 지도 단일 초기화 + center는 setCenter로만 동기화, 마커는 Map<id, Marker>로 diff,
 *          마커 ≥50 시 MarkerClusterer로 드래그 시 메인 스레드·컴포지팅 부하 감소.
 * 측정: idle 이벤트당 실행 시간(ms), 레이아웃 thrash 빈도(Performance 프로파일), 메모리 피크.
 */
import { useEffect, useRef, useState } from "react";
import "@/lib/kakao";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { DEFAULT_REGION, LatLng, StoreItem } from "@/lib/types";

type MarkerClustererLike = {
  clear: () => void;
  addMarkers: (markers: unknown[]) => void;
  setMap: (map: import("@/lib/kakao").KakaoMap | null) => void;
};

type Props = {
  center: LatLng;
  stores: StoreItem[];
  onMapIdle: (payload: {
    center: LatLng;
    bounds: { swLat: number; swLng: number; neLat: number; neLng: number };
  }) => void;
};

const CLUSTER_MIN = 50;

export default function KakaoMapSection({ center, stores, onMapIdle }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("@/lib/kakao").KakaoMap | null>(null);
  const markersByIdRef = useRef<Map<string, import("@/lib/kakao").KakaoMarker>>(new Map());
  const clustererRef = useRef<MarkerClustererLike | null>(null);
  const onMapIdleRef = useRef(onMapIdle);
  onMapIdleRef.current = onMapIdle;

  const [mapError, setMapError] = useState<string | null>(null);
  const { isLoading, isReady, error } = useKakaoMapLoader();

  useEffect(() => {
    if (!containerRef.current || !isReady || !window.kakao?.maps) return;
    if (mapRef.current) return;

    /* cleanup에서 ref.current 대신 이 Map 인스턴스를 캡처해 exhaustive-deps 경고 제거 */
    const markersForUnmount = markersByIdRef.current;

    let idleListenerCb: ((...args: unknown[]) => void) | null = null;
    try {
      const kakaoCenter = new window.kakao.maps.LatLng(
        center.lat ?? DEFAULT_REGION.lat,
        center.lng ?? DEFAULT_REGION.lng
      ); /* 초기 카메라만 사용 — 이후 center 이동은 별도 effect에서 setCenter */
      const map = new window.kakao.maps.Map(containerRef.current, {
        center: kakaoCenter,
        level: 4
      });
      mapRef.current = map;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 지도 인스턴스는 isReady 후 1회만 생성(LocationPickerMap과 동일 패턴)
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

    for (const store of stores) {
      let marker = markersByIdRef.current.get(store.id);
      const pos = new window.kakao.maps.LatLng(store.lat, store.lng);
      if (!marker) {
        marker = new window.kakao.maps.Marker({ position: pos, map });
        markersByIdRef.current.set(store.id, marker);
      } else {
        marker.setPosition(pos);
      }
    }

    if (stores.length >= CLUSTER_MIN) {
      const ClustererCtor = (
        window.kakao.maps as typeof window.kakao.maps & {
          MarkerClusterer?: new (opts: Record<string, unknown>) => MarkerClustererLike;
        }
      ).MarkerClusterer;

      if (ClustererCtor) {
        if (!clustererRef.current) {
          clustererRef.current = new ClustererCtor({
            map,
            averageCenter: true,
            minLevel: 10,
            markers: []
          }) as MarkerClustererLike;
        }
        markersByIdRef.current.forEach((m) => m.setMap(null));
        clustererRef.current.clear?.();
        clustererRef.current.addMarkers?.([...markersByIdRef.current.values()]);
        clustererRef.current.setMap?.(map);
      } else {
        clustererRef.current?.clear?.();
        clustererRef.current?.setMap?.(null);
        clustererRef.current = null;
        markersByIdRef.current.forEach((marker) => marker.setMap(map));
      }
    } else {
      clustererRef.current?.clear?.();
      clustererRef.current?.setMap?.(null);
      clustererRef.current = null;
      markersByIdRef.current.forEach((marker) => {
        marker.setMap(stores.length ? map : null);
      });
    }
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
