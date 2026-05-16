import type { LatLng } from "@/lib/types";

const KEY = "vinyl:lastKnownGeo:v1";
/** SSR initialStores 와 동기 — 서버가 쿠키로 같은 좌표 기준 prefetch */
export const GEO_COOKIE_NAME = "vinyl_geo";
export const GEO_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;
/** 재방문 시 지도·반경 검색 부트스트랩용 — 브라우저 Geolocation 권한과 별개로 마지막 성공 좌표만 보관 */
const MAX_AGE_MS = GEO_COOKIE_MAX_AGE_SEC * 1000;

/** `vinyl_geo=37.5,127.0` — 서버·클라이언트 공용 파서 */
export function parseGeoCookieValue(raw: string | undefined | null): LatLng | null {
  if (!raw) return null;
  const [latStr, lngStr] = raw.split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function readLastKnownGeo(): LatLng | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { lat?: unknown; lng?: unknown; t?: unknown };
    if (typeof p.lat !== "number" || typeof p.lng !== "number" || typeof p.t !== "number") return null;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
    if (Date.now() - p.t > MAX_AGE_MS) return null;
    return { lat: p.lat, lng: p.lng };
  } catch {
    return null;
  }
}

export function writeLastKnownGeo(pos: LatLng): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ lat: pos.lat, lng: pos.lng, t: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
  try {
    document.cookie = `${GEO_COOKIE_NAME}=${pos.lat},${pos.lng};path=/;max-age=${GEO_COOKIE_MAX_AGE_SEC};SameSite=Lax`;
  } catch {
    /* sandboxed iframe 등 */
  }
}
