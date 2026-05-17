import type { KakaoMap } from "@/lib/kakao";

export type KakaoMapInitOptions = {
  center: { getLat: () => number; getLng: () => number };
  level: number;
};

/** Map 인스턴스 생성 직후 — 마커 프리뷰 등 (tilesloaded 보다 빠름) */
export const KAKAO_MAP_READY_EVENT = "kakao-map-ready";

/** 첫 idle(중심·줌 확정) — GPS pan 등 (tilesloaded 보다 빠르고 안정적) */
export const KAKAO_MAP_FIRST_IDLE_EVENT = "kakao-map-first-idle";

/** 첫 타일 페인트 완료 — perf 측정 등 */
export const KAKAO_MAP_TILES_LOADED_EVENT = "kakao-map-tiles-loaded";

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

/** 모바일·고DPR에서 HD 타일(LCP 병목) 완화 — 데스크톱 1x 는 HD 유지 */
export function shouldDisableKakaoMapHD(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.devicePixelRatio >= 2 ||
    window.matchMedia("(max-width: 768px)").matches
  );
}

/**
 * 카카오 공식 HD 비활성화 — Map 생성 전 1회 호출.
 * @see https://apis.map.kakao.com/web/documentation/
 */
export function disableKakaoMapHD(): void {
  if (hdDisabled || typeof window === "undefined" || !window.kakao?.maps) {
    return;
  }
  if (!shouldDisableKakaoMapHD()) return;
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

/** tilesloaded 1회 — perf 측정용 */
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
