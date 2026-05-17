import { runKakaoMapsLoad } from "@/lib/kakao/createKakaoMap";

/** 카카오 지도 JS SDK URL (layout preload · Script · useKakaoMapLoader 공통) */
export function buildKakaoMapSdkUrl(appKey: string): string {
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
    appKey
  )}&autoload=false`;
}

export const KAKAO_MAPS_READY_EVENT = "kakao-maps-ready";

let sdkLoadPromise: Promise<void> | null = null;
let warmupStarted = false;

function runMapsLoad(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined" || !window.kakao?.maps) {
      reject(new Error("카카오맵 SDK 초기화 실패"));
      return;
    }
    runKakaoMapsLoad(() => {
      window.dispatchEvent(new Event(KAKAO_MAPS_READY_EVENT));
      resolve();
    });
  });
}

/**
 * sdk.js 로드 + maps.load() — Script onLoad·useKakaoMapLoader 가 공유.
 * layout preload 로 다운로드가 먼저 시작되면 maps.load 만 빨리 끝남.
 */
export function ensureKakaoMapsReady(appKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!appKey.trim()) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다."));
  }

  if (window.kakao?.maps) {
    return runMapsLoad();
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  const srcUrl = buildKakaoMapSdkUrl(appKey);

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(
      "script[data-kakao-map-sdk='true']"
    ) as HTMLScriptElement | null;

    const attachScriptListeners = (script: HTMLScriptElement) => {
      const onReady = () => {
        void runMapsLoad().then(resolve).catch(reject);
      };
      if (script.getAttribute("data-loaded") === "true" || window.kakao?.maps) {
        onReady();
        return;
      }
      script.addEventListener("load", onReady, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("카카오맵 SDK 로드 실패")),
        { once: true }
      );
    };

    if (existingScript?.src.includes("dapi.kakao.com")) {
      attachScriptListeners(existingScript);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.kakaoMapSdk = "true";
    script.src = srcUrl;
    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      void runMapsLoad().then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoadPromise = null;
    throw error;
  });

  return sdkLoadPromise;
}

/** React effect 이전(렌더 단계)에 maps.load 파이프라인 시작 */
export function startKakaoMapsWarmup(appKey: string): void {
  if (warmupStarted || typeof window === "undefined") return;
  if (!appKey.trim()) return;
  warmupStarted = true;
  void ensureKakaoMapsReady(appKey);
}
