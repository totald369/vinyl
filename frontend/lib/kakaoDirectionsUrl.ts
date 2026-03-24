import type { StoreData } from "@/hooks/useStores";
import type { LatLng } from "@/lib/types";

/** 도착지만 지정 (카카오 기본 링크) */
export function kakaoDestinationOnlyUrl(store: StoreData): string {
  const name = encodeURIComponent(store.name);
  const lat = Number(store.lat);
  const lng = Number(store.lng);
  return `https://map.kakao.com/link/to/${name},${lat},${lng}`;
}

/**
 * 출발: 사용자 위치(내 위치), 도착: 매장
 * @see https://map.kakao.com/?sX=&sY=&sName=&eX=&eY=&eName= (Wcongnamul 좌표)
 */
export function kakaoRouteFromUserToStoreUrl(store: StoreData, user: LatLng): string | null {
  if (typeof window === "undefined") return null;
  const LatLngCtor = window.kakao?.maps?.LatLng;
  if (!LatLngCtor) return null;

  try {
    const start = new LatLngCtor(user.lat, user.lng).toCoords();
    const end = new LatLngCtor(Number(store.lat), Number(store.lng)).toCoords();
    const sX = Math.round(start.getX());
    const sY = Math.round(start.getY());
    const eX = Math.round(end.getX());
    const eY = Math.round(end.getY());
    const sName = encodeURIComponent("내 위치");
    const eName = encodeURIComponent(store.name);
    return `https://map.kakao.com/?map_type=TYPE_MAP&target=car&sX=${sX}&sY=${sY}&sName=${sName}&eX=${eX}&eY=${eY}&eName=${eName}`;
  } catch {
    return null;
  }
}

export function resolveKakaoDirectionsUrl(store: StoreData, userLocation: LatLng | null | undefined): string {
  if (userLocation) {
    const withRoute = kakaoRouteFromUserToStoreUrl(store, userLocation);
    if (withRoute) return withRoute;
  }
  return kakaoDestinationOnlyUrl(store);
}
