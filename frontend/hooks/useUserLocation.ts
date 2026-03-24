"use client";

import { useEffect, useState } from "react";
import { DEFAULT_REGION, LatLng } from "@/lib/types";

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPermission("denied");
      setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      return;
    }

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
        setUserLocation({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
      },
      { timeout: 8000 }
    );
  }, []);

  return { userLocation, permission };
}
