"use client";

/**
 * Geolocation + 마지막 성공 좌표 localStorage 캐시.
 *
 * - 재방문: 캐시를 초기 state로 넣어 지도/매장 반경이 곧바로 직전 위치 기준으로 동작.
 * - 레이스: 연속 getCurrentPosition 시 늦게 도착한 에러가 granted 를 denied 로 덮는 문제 → 요청 세대로 무시.
 * - 권한 거부: Permissions API 가 denied 면 불필요한 getCurrentPosition 호출 생략.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readLastKnownGeo, writeLastKnownGeo } from "@/lib/geoCache";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

type PermissionState = "unknown" | "granted" | "denied" | "requesting";

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(() => readLastKnownGeo());
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const userLocationRef = useRef<LatLng | null>(null);
  userLocationRef.current = userLocation;
  const requestGenRef = useRef(0);

  const requestLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPermission("denied");
      setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      return;
    }

    const gen = ++requestGenRef.current;
    setPermission("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (gen !== requestGenRef.current) return;
        setPermission("granted");
        const next: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(next);
        writeLastKnownGeo(next);
      },
      () => {
        if (gen !== requestGenRef.current) return;
        setPermission("denied");
        if (!userLocationRef.current) {
          setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
        }
      },
      {
        timeout: 12_000,
        maximumAge: 120_000,
        enableHighAccuracy: false
      }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detachPerm: (() => void) | undefined;

    (async () => {
      if (!navigator.permissions?.query) {
        if (!cancelled) requestLocation();
        return;
      }
      try {
        const status = await navigator.permissions.query({
          name: "geolocation" as PermissionName
        });
        if (cancelled) return;
        if (status.state === "denied") {
          setPermission("denied");
          return;
        }
        if (cancelled) return;
        requestLocation();
        const onChange = () => {
          if (status.state === "granted") {
            requestLocation();
          } else if (status.state === "denied") {
            setPermission("denied");
          }
        };
        status.addEventListener("change", onChange);
        detachPerm = () => status.removeEventListener("change", onChange);
      } catch {
        if (!cancelled) requestLocation();
      }
    })();

    return () => {
      cancelled = true;
      detachPerm?.();
    };
  }, [requestLocation]);

  return { userLocation, permission, requestLocation };
}
