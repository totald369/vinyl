import type { LatLng } from "@/lib/types";

const KEY = "vinyl:lastKnownGeo:v1";
/** 재방문 시 지도·반경 검색 부트스트랩용 — 브라우저 Geolocation 권한과 별개로 마지막 성공 좌표만 보관 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
}
