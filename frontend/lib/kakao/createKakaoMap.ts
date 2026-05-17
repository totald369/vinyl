import type { KakaoMap } from "@/lib/kakao";

export type KakaoMapInitOptions = {
  center: { getLat: () => number; getLng: () => number };
  level: number;
};

/**
 * 카카오 지도는 devicePixelRatio≥2 에서 HD 타일(512px)을 받아 256px로 축소 표시 → 대역폭·LCP 낭비.
 * Map 생성 직전에만 DPR=1 로 위장해 1x 타일을 요청한다.
 */
export function withSdrDevicePixelRatio<T>(run: () => T): T {
  if (typeof window === "undefined") {
    return run();
  }

  const original = window.devicePixelRatio;
  if (original <= 1) {
    return run();
  }

  try {
    Object.defineProperty(window, "devicePixelRatio", {
      value: 1,
      configurable: true,
      writable: true
    });
    return run();
  } finally {
    try {
      Object.defineProperty(window, "devicePixelRatio", {
        value: original,
        configurable: true,
        writable: true
      });
    } catch {
      /* 일부 WebView 에서 복원 실패 시 무시 */
    }
  }
}

export function createKakaoMap(
  container: HTMLElement,
  options: KakaoMapInitOptions
): KakaoMap {
  return withSdrDevicePixelRatio(() => {
    const map = new window.kakao.maps.Map(container, {
      center: options.center,
      level: options.level,
      tileAnimation: false
    } as KakaoMapInitOptions & { tileAnimation: boolean });
    return map;
  });
}
