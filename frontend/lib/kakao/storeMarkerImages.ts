import type { StoreListFilter } from "@/hooks/useStores";

export const STORE_MARKER_DISPLAY_PX = 80;

const FILTER_MARKER_SRC: Record<StoreListFilter, { src: string; selectedSrc: string }> = {
  payBag: {
    src: "/Img/Icon/trash_bag_80.svg",
    selectedSrc: "/Img/Icon/trash_bag_80_selected.svg"
  },
  nonBurnable: {
    src: "/Img/Icon/non-fire_80.svg",
    selectedSrc: "/Img/Icon/non-fire_80_selected.svg"
  },
  largeSticker: {
    src: "/Img/Icon/sticker_80.svg",
    selectedSrc: "/Img/Icon/sticker_80_selected.svg"
  }
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

/** 필터별 MarkerImage 2종(일반·선택) — 마커마다 재생성하지 않음 */
export function getStoreMarkerImages(
  filter: StoreListFilter
): MarkerImagePair {
  if (cached?.[filter]) return cached[filter]!;

  if (!isKakaoMapsConstructorsReady()) {
    return { normal: null, selected: null };
  }

  const maps = window.kakao!.maps;
  const px = STORE_MARKER_DISPLAY_PX;
  const size = new maps.Size(px, px);
  const offset = new maps.Point(px / 2, px / 2);
  const meta = FILTER_MARKER_SRC[filter];

  const pair: MarkerImagePair = {
    normal: new maps.MarkerImage(meta.src, size, { offset }),
    selected: new maps.MarkerImage(meta.selectedSrc, size, { offset })
  };

  if (!cached) cached = {};
  cached[filter] = pair;
  return pair;
}

/** activeFilter 변경 시 이전 필터 이미지 캐시는 유지(3종만 존재) */
export function invalidateStoreMarkerImageCache(): void {
  cached = null;
}
