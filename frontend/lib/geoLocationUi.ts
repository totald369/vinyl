import { DEFAULT_REGION, type LatLng } from "@/lib/types";

/** 기본(강남) 폴백이 아닌, 저장·캐시된 실제 사용자 좌표인지 */
export function hasSavedUserGeo(loc: LatLng | null | undefined): boolean {
  if (!loc) return false;
  return (
    Math.abs(loc.lat - DEFAULT_REGION.lat) > 1e-4 ||
    Math.abs(loc.lng - DEFAULT_REGION.lng) > 1e-4
  );
}
