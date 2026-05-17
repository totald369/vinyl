import type { KakaoMap } from "@/lib/kakao";

export type KakaoMapInitOptions = {
  center: { getLat: () => number; getLng: () => number };
  level: number;
};

/** 첫 타일 페인트 완료 — 마커·GPS pan 등 후속 작업 트리거 */
export const KAKAO_MAP_TILES_LOADED_EVENT = "kakao-map-tiles-loaded";

let hdDisabled = false;

/**
 * 카카오 공식 HD 비활성화 — Map 생성 전 1회 호출.
 * @see https://apis.map.kakao.com/web/documentation/
 */
export function disableKakaoMapHD(): void {
  if (hdDisabled || typeof window === "undefined" || !window.kakao?.maps) {
    return;
  }
  const { disableHD } = window.kakao.maps;
  if (typeof disableHD === "function") {
    disableHD();
    hdDisabled = true;
  }
}

/** maps.load 콜백 — disableHD 후 사용자 콜백 실행 */
export function runKakaoMapsLoad(callback: () => void): void {
  if (typeof window === "undefined" || !window.kakao?.maps) {
    return;
  }
  window.kakao.maps.load(() => {
    disableKakaoMapHD();
    callback();
  });
}

export function createKakaoMap(
  container: HTMLElement,
  options: KakaoMapInitOptions
): KakaoMap {
  disableKakaoMapHD();
  const map = new window.kakao.maps.Map(container, {
    center: options.center,
    level: options.level,
    tileAnimation: false
  } as KakaoMapInitOptions & { tileAnimation: boolean });
  return map;
}

/** tilesloaded 1회 — LCP 이후 마커·데이터 작업용 */
export function onKakaoMapTilesLoadedOnce(
  map: KakaoMap,
  handler: () => void
): () => void {
  if (typeof window === "undefined" || !window.kakao?.maps) {
    return () => undefined;
  }

  let fired = false;
  const listener = () => {
    if (fired) return;
    fired = true;
    handler();
    window.dispatchEvent(new Event(KAKAO_MAP_TILES_LOADED_EVENT));
  };

  window.kakao.maps.event.addListener(map, "tilesloaded", listener);
  return () => {
    if (!fired && window.kakao?.maps) {
      window.kakao.maps.event.removeListener(map, "tilesloaded", listener);
    }
  };
}
