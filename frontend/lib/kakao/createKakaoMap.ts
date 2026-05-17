import type { KakaoMap } from "@/lib/kakao";
import { installAllKakaoSdrPatches } from "@/lib/kakao/installKakaoSdrPatches";

export type KakaoMapInitOptions = {
  center: { getLat: () => number; getLng: () => number };
  level: number;
};

/**
 * 카카오 지도는 devicePixelRatio≥2 에서 HD 타일(512px)을 받아 축소 표시 → 대역폭·LCP 낭비.
 */
export function withSdrDevicePixelRatio<T>(run: () => T): T {
  if (typeof window === "undefined") {
    return run();
  }

  installAllKakaoSdrPatches();

  const original = window.devicePixelRatio;
  if (original <= 1) {
    return run();
  }

  const setDpr = (value: number) => {
    try {
      Object.defineProperty(window, "devicePixelRatio", {
        value,
        configurable: true,
        writable: true
      });
    } catch {
      (window as Window & { devicePixelRatio: number }).devicePixelRatio = value;
    }
  };

  setDpr(1);
  try {
    return run();
  } finally {
    setDpr(original);
  }
}

/** maps.load() 시점에도 DPR=1 + 패치 활성 */
export function runKakaoMapsLoad(callback: () => void): void {
  withSdrDevicePixelRatio(() => {
    window.kakao.maps.load(callback);
  });
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
