"use client";

/**
 * 단발 geolocation 요청.
 *
 * 변경 전: requestLocation이 userLocation에 의존해 매 렌더 새 함수 → 자식 useCallback 연쇄 무효화.
 * 변경 후: 최신 좌표는 ref로 보관, requestLocation은 [] 의존 안정 참조.
 * 측정: 불필요한 훅·자식 리렌더 수(React DevTools profiler).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

type PermissionState = "unknown" | "granted" | "denied" | "requesting";

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const userLocationRef = useRef<LatLng | null>(null);
  userLocationRef.current = userLocation;

  const requestLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPermission("denied");
      setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      return;
    }

    setPermission("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPermission("granted");
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => {
        setPermission("denied");
        if (!userLocationRef.current) {
          setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
        }
      },
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { userLocation, permission, requestLocation };
}
