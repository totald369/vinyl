"use client";

import { useEffect, useRef, useState } from "react";
import "@/lib/kakao";
import { useKakaoMapLoader } from "@/hooks/useKakaoMapLoader";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

type Props = {
  value: LatLng;
  onChange: (value: LatLng) => void;
};

export default function LocationPickerMap({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("@/lib/kakao").KakaoMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLoading, isReady, error: loaderError } = useKakaoMapLoader();

  useEffect(() => {
    if (!containerRef.current || !isReady || !window.kakao?.maps) return;

    let mounted = true;
    try {
      const map = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(value.lat ?? DEFAULT_REGION.lat, value.lng ?? DEFAULT_REGION.lng),
        level: 4
      });
      mapRef.current = map;
      console.info("[KakaoMap] map initialized (LocationPickerMap)");

      window.kakao.maps.event.addListener(map, "idle", () => {
        const center = map.getCenter();
        onChange({ lat: center.getLat(), lng: center.getLng() });
      });
    } catch (e) {
      if (mounted) {
        console.error("[KakaoMap] map initialization failed (LocationPickerMap)", e);
        setError(e instanceof Error ? e.message : "지도 로드 오류");
      }
    }

    return () => {
      mounted = false;
    };
  }, [isReady, onChange, value.lat, value.lng]);

  useEffect(() => {
    if (!loaderError) return;
    setError(loaderError);
  }, [loaderError]);

  return (
    <div className="relative">
      {error ? (
        <div className="flex h-56 items-center justify-center rounded-xl bg-danger-50 text-body-sm text-danger-700">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex h-56 items-center justify-center rounded-xl bg-bg-muted text-body-sm text-text-secondary">
          지도를 불러오는 중입니다...
        </div>
      ) : (
        <>
          <div ref={containerRef} className="h-56 w-full rounded-xl border border-border-subtle" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-bg-surface bg-brand-500 shadow-elevation-2" />
          </div>
        </>
      )}
    </div>
  );
}
