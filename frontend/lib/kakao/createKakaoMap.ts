import type { KakaoMap } from "@/lib/kakao";
import { DEFAULT_REGION } from "@/lib/types";

export type KakaoMapInitOptions = {
  center: { getLat: () => number; getLng: () => number };
  level: number;
};

/** Map 생성 직후 — 마커 프리뷰 등 (tilesloaded 보다 빠름) */
export const KAKAO_MAP_READY_EVENT = "kakao-map-ready";

/** 첫 idle(중심·줌 확정) — GPS pan 등 (tilesloaded 보다 빠르고 안정적) */
export const KAKAO_MAP_FIRST_IDLE_EVENT = "kakao-map-first-idle";

/** 첫 타일 페인트 완료 — LCP placeholder 제거·perf 측정 */
export const KAKAO_MAP_TILES_LOADED_EVENT = "kakao-map-tiles-loaded";

/** 쓰봉맵: 전국 보기 불필요 — 타일·마커 부담 감소 */
export const KAKAO_MAP_MIN_LEVEL = 2;
export const KAKAO_MAP_MAX_LEVEL = 7;

const KOREA_SW = { lat: 33.0, lng: 124.5 };
const KOREA_NE = { lat: 38.7, lng: 132.0 };

let mapReadyNotified = false;

export function wasKakaoMapReadyNotified(): boolean {
  return mapReadyNotified;
}

export function notifyKakaoMapReady(): void {
  if (typeof window === "undefined") return;
  mapReadyNotified = true;
  window.dispatchEvent(new Event(KAKAO_MAP_READY_EVENT));
}

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

export function clampKakaoMapLevel(level: number): number {
  return Math.max(KAKAO_MAP_MIN_LEVEL, Math.min(KAKAO_MAP_MAX_LEVEL, Math.round(level)));
}

/**
 * 줌 범위 + 한국 영역 밖 드래그 시 기본 중심으로 복귀.
 * @returns dragend 리스너 해제 함수
 */
export function configureKakaoMapViewport(map: KakaoMap): () => void {
  const maps = window.kakao?.maps;
  if (!maps) return () => undefined;

  const mapWithZoom = map as KakaoMap & {
    setMinLevel?: (level: number) => void;
    setMaxLevel?: (level: number) => void;
  };
  mapWithZoom.setMinLevel?.(KAKAO_MAP_MIN_LEVEL);
  mapWithZoom.setMaxLevel?.(KAKAO_MAP_MAX_LEVEL);

  const LatLngBounds = (
    maps as typeof maps & {
      LatLngBounds?: new (
        sw: { getLat: () => number; getLng: () => number },
        ne: { getLat: () => number; getLng: () => number }
      ) => { contain: (ll: { getLat: () => number; getLng: () => number }) => boolean };
    }
  ).LatLngBounds;

  if (!LatLngBounds) return () => undefined;

  const bounds = new LatLngBounds(
    new maps.LatLng(KOREA_SW.lat, KOREA_SW.lng),
    new maps.LatLng(KOREA_NE.lat, KOREA_NE.lng)
  );
  const home = new maps.LatLng(DEFAULT_REGION.lat, DEFAULT_REGION.lng);

  const onDragEnd = () => {
    const center = map.getCenter();
    if (!bounds.contain(center)) {
      map.panTo(home);
    }
  };

  maps.event.addListener(map, "dragend", onDragEnd);
  return () => {
    if (window.kakao?.maps) {
      window.kakao.maps.event.removeListener(map, "dragend", onDragEnd);
    }
  };
}

export function createKakaoMap(
  container: HTMLElement,
  options: KakaoMapInitOptions
): KakaoMap {
  disableKakaoMapHD();
  const map = new window.kakao.maps.Map(container, {
    center: options.center,
    level: clampKakaoMapLevel(options.level),
    tileAnimation: false
  } as KakaoMapInitOptions & { tileAnimation: boolean });
  configureKakaoMapViewport(map);
  return map;
}

/** 컨테이너 크기 변경(hydration shell 등) 후 타일·좌표 재계산 */
export function relayoutKakaoMap(map: KakaoMap): void {
  if (typeof map.relayout === "function") {
    map.relayout();
  }
}

/** idle 1회 — GPS pan 등 */
export function onKakaoMapFirstIdleOnce(
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
    window.dispatchEvent(new Event(KAKAO_MAP_FIRST_IDLE_EVENT));
  };

  window.kakao.maps.event.addListener(map, "idle", listener);
  return () => {
    if (!fired && window.kakao?.maps) {
      window.kakao.maps.event.removeListener(map, "idle", listener);
    }
  };
}

/** tilesloaded 1회 — LCP placeholder 제거·perf 측정 */
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
