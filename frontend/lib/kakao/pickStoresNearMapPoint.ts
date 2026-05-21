import type { KakaoMap } from "@/lib/kakao";
import type { StoreData } from "@/lib/storeData";

export type MapPointXY = { x: number; y: number };

/** 터치·클릭 정확도 (px) — 좁을수록 오선택 감소 */
export const STORE_PICK_RADIUS_PX = 40;
/** 후보 최대 개수 (UI·연산 상한) */
export const STORE_PICK_MAX_CANDIDATES = 6;

export function mapPointToXY(pt: { getX?: () => number; getY?: () => number; x?: number; y?: number }): MapPointXY {
  if (typeof pt.getX === "function" && typeof pt.getY === "function") {
    return { x: pt.getX(), y: pt.getY() };
  }
  return { x: Number(pt.x), y: Number(pt.y) };
}

/**
 * 지도 클릭·마커 탭 좌표 기준 화면 거리(px)로 후보를 거리순 반환.
 * 2건 이상이면 호출측에서 선택 UI 표시.
 */
export function pickStoresNearMapPoint(
  map: KakaoMap,
  clickLatLng: { getLat: () => number; getLng: () => number },
  stores: StoreData[],
  mapSize: { w: number; h: number },
  radiusPx: number = STORE_PICK_RADIUS_PX
): StoreData[] {
  const kakao = typeof window !== "undefined" ? window.kakao?.maps : undefined;
  if (!kakao || !stores.length) return [];

  const proj = map.getProjection?.();
  if (!proj?.pointFromCoords) return [];

  const clickXY = mapPointToXY(proj.pointFromCoords(clickLatLng));
  const clickLat = clickLatLng.getLat();
  const clickLng = clickLatLng.getLng();

  let latRadius = 0.005;
  let lngRadius = 0.005;
  try {
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const pxPerLat = mapSize.h / Math.max(1e-6, ne.getLat() - sw.getLat());
    const pxPerLng = mapSize.w / Math.max(1e-6, ne.getLng() - sw.getLng());
    latRadius = (radiusPx / pxPerLat) * 1.15;
    lngRadius = (radiusPx / pxPerLng) * 1.15;
  } catch {
    /* bounds not ready */
  }

  const hits: { store: StoreData; d: number }[] = [];

  for (const store of stores) {
    const lat = Number(store.lat);
    const lng = Number(store.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat - clickLat) > latRadius) continue;
    if (Math.abs(lng - clickLng) > lngRadius) continue;

    const mXY = mapPointToXY(proj.pointFromCoords(new kakao.LatLng(lat, lng)));
    const d = Math.hypot(mXY.x - clickXY.x, mXY.y - clickXY.y);
    if (d <= radiusPx) {
      hits.push({ store, d });
    }
  }

  hits.sort((a, b) => a.d - b.d);
  return hits.slice(0, STORE_PICK_MAX_CANDIDATES).map((h) => h.store);
}
