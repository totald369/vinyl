import type { StoreListFilter } from "@/hooks/useStores";

export const STORE_MARKER_DISPLAY_PX = 80;
export const STORE_MARKER_SELECTED_SCALE = 1.6;

const FILTER_MARKER_SRC: Record<StoreListFilter, string> = {
  payBag: "/Img/Icon/trash_bag_80.svg",
  nonBurnable: "/Img/Icon/non-fire_80.svg",
  largeSticker: "/Img/Icon/sticker_80.svg"
};

type MarkerImagePair = { normal: unknown; selected: unknown };

let cached: Partial<Record<StoreListFilter, MarkerImagePair>> | null = null;

/** autoload=false 시 maps.load() 완료 전에는 Size 등 생성자가 없음 */
export function isKakaoMapsConstructorsReady(): boolean {
  if (typeof window === "undefined") return false;
  const maps = window.kakao?.maps;
  return !!(
    maps &&
    typeof maps.Size === "function" &&
    typeof maps.Point === "function" &&
    typeof maps.MarkerImage === "function"
  );
}

/** 필터별 MarkerImage 2종(일반·선택 160%) — 마커마다 재생성하지 않음 */
export function getStoreMarkerImages(
  filter: StoreListFilter
): MarkerImagePair {
  if (cached?.[filter]) return cached[filter]!;

  if (!isKakaoMapsConstructorsReady()) {
    return { normal: null, selected: null };
  }

  const maps = window.kakao!.maps;
  const src = FILTER_MARKER_SRC[filter];
  const normalPx = STORE_MARKER_DISPLAY_PX;
  const selectedPx = Math.round(normalPx * STORE_MARKER_SELECTED_SCALE);
  const normalSize = new maps.Size(normalPx, normalPx);
  const selectedSize = new maps.Size(selectedPx, selectedPx);

  const pair: MarkerImagePair = {
    normal: new maps.MarkerImage(src, normalSize, {
      offset: new maps.Point(normalPx / 2, normalPx / 2)
    }),
    selected: new maps.MarkerImage(src, selectedSize, {
      offset: new maps.Point(selectedPx / 2, selectedPx / 2)
    })
  };

  if (!cached) cached = {};
  cached[filter] = pair;
  return pair;
}

/** activeFilter 변경 시 이전 필터 이미지 캐시는 유지(3종만 존재) */
export function invalidateStoreMarkerImageCache(): void {
  cached = null;
}
