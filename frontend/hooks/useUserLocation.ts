"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

type PermissionState = "unknown" | "granted" | "denied" | "requesting";

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");

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
        if (!userLocation) {
          setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
        }
      },
      { timeout: 8000 }
    );
  }, [userLocation]);

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { userLocation, permission, requestLocation };
}
