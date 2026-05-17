"use client";

/**
 * Geolocation + 마지막 성공 좌표 localStorage 캐시.
 *
 * - Chrome 등에서 사이트 위치가 "차단"이면 브라우저가 프롬프트를 다시 띄우지 않음 →
 *   geolocationBlocked + 모달 안내. 저장된 좌표가 있으면 그곳으로는 즉시 이동 가능.
 * - 설정에서 허용 후 탭 복귀 시 visibilitychange 로 권한 재조회.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readLastKnownGeo, writeLastKnownGeo } from "@/lib/geoCache";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

type PermissionState = "unknown" | "granted" | "denied" | "requesting";

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  /** Permissions API 또는 PERMISSION_DENIED — 브라우저 설정에서만 해제 가능 */
  const [geolocationBlocked, setGeolocationBlocked] = useState(false);
  const userLocationRef = useRef<LatLng | null>(null);
  userLocationRef.current = userLocation;
  const requestGenRef = useRef(0);

  const requestLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPermission("denied");
      setGeolocationBlocked(true);
      if (!userLocationRef.current) {
        setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      }
      return;
    }

    const gen = ++requestGenRef.current;
    setPermission("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (gen !== requestGenRef.current) return;
        setGeolocationBlocked(false);
        setPermission("granted");
        const next: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(next);
        writeLastKnownGeo(next);
      },
      (err) => {
        if (gen !== requestGenRef.current) return;
        const denied =
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as GeolocationPositionError).code ===
            (err as GeolocationPositionError).PERMISSION_DENIED;
        if (denied) setGeolocationBlocked(true);
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

  const syncBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!navigator.permissions?.query) {
      requestLocation();
      return;
    }
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName
      });
      if (status.state === "granted") {
        setGeolocationBlocked(false);
        requestLocation();
        return;
      }
      if (status.state === "denied") {
        setGeolocationBlocked(true);
        setPermission("denied");
        return;
      }
      setGeolocationBlocked(false);
      setPermission("unknown");
    } catch {
      requestLocation();
    }
  }, [requestLocation]);

  /** localStorage 캐시는 hydration 이후 적용 (SSR 과 초기 HTML 일치) */
  useEffect(() => {
    const cached = readLastKnownGeo();
    if (cached) setUserLocation(cached);
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

        const onChange = () => {
          if (status.state === "granted") {
            setGeolocationBlocked(false);
            requestLocation();
          } else if (status.state === "denied") {
            setGeolocationBlocked(true);
            setPermission("denied");
          } else {
            setGeolocationBlocked(false);
            setPermission("unknown");
          }
        };

        if (status.state === "denied") {
          setGeolocationBlocked(true);
          setPermission("denied");
        } else {
          if (!cancelled) requestLocation();
        }

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

  /** 설정 앱에서 허용 후 돌아왔을 때 권한 재조회 */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void syncBrowserPermission();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncBrowserPermission]);

  return { userLocation, permission, geolocationBlocked, requestLocation, syncBrowserPermission };
}
