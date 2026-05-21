import type { KakaoMap } from "@/lib/kakao";
import type { StoreData } from "@/lib/storeData";

type MapPointXY = { x: number; y: number };

export const STORE_PICK_MAX_DISTANCE_PX = 52;
/** 화면 거리가 이 값 이내면 같은 지점 겹침으로 보고 아래 레이어 우선 */
const SAME_SPOT_EPS_PX = 3;

function mapPointToXY(pt: { getX?: () => number; getY?: () => number; x?: number; y?: number }): MapPointXY {
  if (typeof pt.getX === "function" && typeof pt.getY === "function") {
    return { x: pt.getX(), y: pt.getY() };
  }
  return { x: Number(pt.x), y: Number(pt.y) };
}

type PickCandidate = {
  store: StoreData;
  distancePx: number;
  stackOrder: number;
};

/**
 * 탭 좌표에 가장 맞는 마커 1개.
 * 거리가 비슷하면 stackOrder가 낮은 마커(먼저 그려진·아래 레이어)를 선택.
 */
export function pickStoreAtMapClick(
  map: KakaoMap,
  clickLatLng: { getLat: () => number; getLng: () => number },
  stores: StoreData[],
  stackOrderById: ReadonlyMap<string, number>,
  mapSize: { w: number; h: number }
): StoreData | null {
  const kakao = typeof window !== "undefined" ? window.kakao?.maps : undefined;
  if (!kakao || !stores.length) return null;

  const proj = map.getProjection?.();
  if (!proj?.pointFromCoords) return null;

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
    latRadius = (STORE_PICK_MAX_DISTANCE_PX / pxPerLat) * 1.2;
    lngRadius = (STORE_PICK_MAX_DISTANCE_PX / pxPerLng) * 1.2;
  } catch {
    /* bounds not ready */
  }

  const hits: PickCandidate[] = [];

  for (const store of stores) {
    const lat = Number(store.lat);
    const lng = Number(store.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat - clickLat) > latRadius) continue;
    if (Math.abs(lng - clickLng) > lngRadius) continue;

    const mXY = mapPointToXY(proj.pointFromCoords(new kakao.LatLng(lat, lng)));
    const distancePx = Math.hypot(mXY.x - clickXY.x, mXY.y - clickXY.y);
    if (distancePx > STORE_PICK_MAX_DISTANCE_PX) continue;

    hits.push({
      store,
      distancePx,
      stackOrder: stackOrderById.get(store.id) ?? Number.MAX_SAFE_INTEGER
    });
  }

  if (!hits.length) return null;

  hits.sort((a, b) => {
    const distDiff = a.distancePx - b.distancePx;
    if (Math.abs(distDiff) <= SAME_SPOT_EPS_PX) {
      return a.stackOrder - b.stackOrder;
    }
    return distDiff;
  });

  return hits[0]!.store;
}
