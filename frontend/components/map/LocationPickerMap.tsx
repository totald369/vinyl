"use client";

import { useEffect, useRef, useState } from "react";
import "@/lib/kakao";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

const COORD_EPS = 1e-5;

type Props = {
  value: LatLng;
  onChange: (value: LatLng) => void;
  selectedMarkerPosition?: LatLng | null;
  className?: string;
  mapClassName?: string;
};

export default function LocationPickerMap({
  value,
  onChange,
  selectedMarkerPosition = null,
  className,
  mapClassName
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("@/lib/kakao").KakaoMap | null>(null);
  const selectedMarkerRef = useRef<import("@/lib/kakao").KakaoMarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLoading, isReady, error: loaderError } = useKakaoMapLoader();

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const skipIdleAfterProgrammaticRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current || !isReady || !window.kakao?.maps) return;
    if (mapRef.current) return;

    const el = containerRef.current;
    const v = valueRef.current;
    const lat = v.lat ?? DEFAULT_REGION.lat;
    const lng = v.lng ?? DEFAULT_REGION.lng;

    let mounted = true;
    try {
      const map = new window.kakao.maps.Map(el, {
        center: new window.kakao.maps.LatLng(lat, lng),
        level: 4
      });
      mapRef.current = map;
      console.info("[KakaoMap] map initialized (LocationPickerMap)");

      window.kakao.maps.event.addListener(map, "idle", () => {
        if (skipIdleAfterProgrammaticRef.current > 0) {
          skipIdleAfterProgrammaticRef.current -= 1;
          return;
        }
        const center = map.getCenter();
        onChangeRef.current({ lat: center.getLat(), lng: center.getLng() });
      });
    } catch (e) {
      if (mounted) {
        console.error("[KakaoMap] map initialization failed (LocationPickerMap)", e);
        setError(e instanceof Error ? e.message : "지도 로드 오류");
      }
    }

    return () => {
      mounted = false;
      mapRef.current = null;
      if (el) el.innerHTML = "";
    };
  }, [isReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    const center = map.getCenter();
    const clat = center.getLat();
    const clng = center.getLng();
    const lat = value.lat ?? DEFAULT_REGION.lat;
    const lng = value.lng ?? DEFAULT_REGION.lng;

    if (Math.abs(clat - lat) < COORD_EPS && Math.abs(clng - lng) < COORD_EPS) return;

    skipIdleAfterProgrammaticRef.current = 1;
    map.setCenter(new window.kakao.maps.LatLng(lat, lng));
  }, [value.lat, value.lng]);

  useEffect(() => {
    if (!loaderError) return;
    setError(loaderError);
  }, [loaderError]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;

    const map = mapRef.current;
    const kakao = window.kakao.maps;

    if (!selectedMarkerPosition) {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.setMap(null);
        selectedMarkerRef.current = null;
      }
      return;
    }

    const lat = Number(selectedMarkerPosition.lat);
    const lng = Number(selectedMarkerPosition.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const markerPosition = new kakao.LatLng(lat, lng);
    const markerImage = new kakao.MarkerImage(
      "/Img/Icon/store_Pin_80.svg",
      new kakao.Size(80, 80),
      { offset: new kakao.Point(40, 60) }
    );

    if (!selectedMarkerRef.current) {
      selectedMarkerRef.current = new kakao.Marker({
        map,
        position: markerPosition,
        image: markerImage,
        zIndex: 200
      });
    } else {
      selectedMarkerRef.current.setPosition(markerPosition);
    }
  }, [selectedMarkerPosition]);

  return (
    <div className={className ?? "relative h-56"}>
      {error ? (
        <div className="flex h-full items-center justify-center bg-danger-50 text-body-sm text-danger-700">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex h-full items-center justify-center bg-bg-muted text-body-sm text-text-secondary">
          지도를 불러오는 중입니다...
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className={mapClassName ?? "h-full w-full rounded-xl border border-border-subtle"}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[#171717]">
              <div className="size-4 rounded-full bg-[#d4fe1c]" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
