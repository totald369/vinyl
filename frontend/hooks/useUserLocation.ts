"use client";

/**
 * Geolocation + 마지막 성공 좌표 localStorage 캐시.
 *
 * - 페이지 로드 시 getCurrentPosition 호출 안 함 (미정·거부) — refetch·마커 깜빡임 방지.
 * - Permissions API로 이미 허용(granted)된 경우만 자동 위치 갱신.
 * - 미정/거부는 "내 위치로" 버튼·모달 허용 시에만 requestLocation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readLastKnownGeo, writeLastKnownGeo } from "@/lib/geoCache";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

type PermissionState = "unknown" | "granted" | "denied" | "requesting";

export type RequestLocationOptions = {
  /** 이미 허용된 경우 UI·permission 상태를 requesting 으로 바꾸지 않고 백그라운드 갱신 */
  silent?: boolean;
};

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [geolocationBlocked, setGeolocationBlocked] = useState(false);
  const userLocationRef = useRef<LatLng | null>(null);
  userLocationRef.current = userLocation;
  const permissionRef = useRef<PermissionState>("unknown");
  permissionRef.current = permission;
  const requestGenRef = useRef(0);

  const requestLocation = useCallback((options?: RequestLocationOptions) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPermission("denied");
      setGeolocationBlocked(true);
      if (!userLocationRef.current) {
        setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      }
      return;
    }

    const gen = ++requestGenRef.current;
    const silent = options?.silent === true && permissionRef.current === "granted";
    if (!silent) {
      setPermission("requesting");
    }
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
    if (typeof window === "undefined" || !navigator.permissions?.query) {
      return;
    }
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName
      });
      if (status.state === "granted") {
        setGeolocationBlocked(false);
        setPermission("granted");
        requestLocation({ silent: !!userLocationRef.current });
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
      /* Permissions API 실패 시 자동 geolocation 호출 안 함 */
    }
  }, [requestLocation]);

  useEffect(() => {
    const cached = readLastKnownGeo();
    if (cached) setUserLocation(cached);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detachPerm: (() => void) | undefined;

    (async () => {
      if (!navigator.permissions?.query) {
        if (!cancelled) {
          setGeolocationBlocked(false);
          setPermission("unknown");
        }
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
            setPermission("granted");
            requestLocation({ silent: !!userLocationRef.current });
          } else if (status.state === "denied") {
            setGeolocationBlocked(true);
            setPermission("denied");
          } else {
            setGeolocationBlocked(false);
            setPermission("unknown");
          }
        };

        if (status.state === "granted") {
          setGeolocationBlocked(false);
          setPermission("granted");
          if (!cancelled) {
            requestLocation({ silent: !!readLastKnownGeo() });
          }
        } else if (status.state === "denied") {
          setGeolocationBlocked(true);
          setPermission("denied");
        } else {
          setGeolocationBlocked(false);
          setPermission("unknown");
        }

        status.addEventListener("change", onChange);
        detachPerm = () => status.removeEventListener("change", onChange);
      } catch {
        if (!cancelled) setPermission("unknown");
      }
    })();

    return () => {
      cancelled = true;
      detachPerm?.();
    };
  }, [requestLocation]);

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
