import { runKakaoMapsLoad } from "@/lib/kakao/createKakaoMap";

/** layout Script · programmatic 삽입 공통 id */
export const KAKAO_MAP_SDK_SCRIPT_ID = "kakao-map-sdk";

export const KAKAO_MAPS_READY_EVENT = "kakao-maps-ready";

let sdkLoadPromise: Promise<void> | null = null;
let mapsApiReady = false;
let warmupStarted = false;

function logSdkError(message: string, cause?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- SDK 실패는 dev 에서만
    console.error(message, cause);
  }
}

/** 카카오 지도 JS SDK URL — core only (clusterer 미사용) */
export function buildKakaoMapSdkUrl(appKey: string): string {
  const params = new URLSearchParams({
    appkey: appKey,
    autoload: "false"
  });
  return `https://dapi.kakao.com/v2/maps/sdk.js?${params.toString()}`;
}

function getExistingSdkScript(): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  return (
    (document.getElementById(KAKAO_MAP_SDK_SCRIPT_ID) as HTMLScriptElement | null) ??
    (document.querySelector(
      "script[data-kakao-map-sdk='true']"
    ) as HTMLScriptElement | null)
  );
}

function runMapsLoad(): Promise<void> {
  if (mapsApiReady) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined" || !window.kakao?.maps) {
      reject(new Error("카카오맵 SDK 초기화 실패"));
      return;
    }
    runKakaoMapsLoad(() => {
      mapsApiReady = true;
      window.dispatchEvent(new Event(KAKAO_MAPS_READY_EVENT));
      resolve();
    });
  });
}

/**
 * sdk.js 1회 삽입 + maps.load() singleton.
 * window.kakao.maps 가 있어도 maps.load 완료 전에는 resolve 하지 않음.
 */
export function ensureKakaoMapsReady(appKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!appKey.trim()) {
    const err = new Error("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다.");
    logSdkError("[KakaoMap] missing app key");
    return Promise.reject(err);
  }

  if (mapsApiReady) {
    return Promise.resolve();
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  const srcUrl = buildKakaoMapSdkUrl(appKey);

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const finishLoad = () => {
      void runMapsLoad().then(resolve).catch((e) => {
        sdkLoadPromise = null;
        logSdkError("[KakaoMap] maps.load failed", e);
        reject(e);
      });
    };

    const existing = getExistingSdkScript();
    if (existing?.src.includes("dapi.kakao.com")) {
      if (existing.getAttribute("data-loaded") === "true" || window.kakao?.maps) {
        finishLoad();
        return;
      }
      existing.addEventListener("load", finishLoad, { once: true });
      existing.addEventListener(
        "error",
        () => {
          sdkLoadPromise = null;
          const err = new Error("카카오맵 SDK 로드 실패");
          logSdkError("[KakaoMap] script error", err);
          reject(err);
        },
        { once: true }
      );
      return;
    }

    if (window.kakao?.maps) {
      finishLoad();
      return;
    }

    const script = document.createElement("script");
    script.id = KAKAO_MAP_SDK_SCRIPT_ID;
    script.async = true;
    script.dataset.kakaoMapSdk = "true";
    script.src = srcUrl;
    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      finishLoad();
    };
    script.onerror = () => {
      sdkLoadPromise = null;
      const err = new Error("카카오맵 SDK 로드 실패");
      logSdkError("[KakaoMap] script error", err);
      reject(err);
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoadPromise = null;
    throw error;
  });

  return sdkLoadPromise;
}

/** @alias ensureKakaoMapsReady */
export function loadKakaoMapSdk(appKey: string): Promise<void> {
  return ensureKakaoMapsReady(appKey);
}

export function isKakaoMapsApiReady(): boolean {
  return mapsApiReady;
}

/** React effect 이전(렌더 단계)에 maps.load 파이프라인 시작 */
export function startKakaoMapsWarmup(appKey: string): void {
  if (warmupStarted || typeof window === "undefined") return;
  if (!appKey.trim()) return;
  warmupStarted = true;
  void ensureKakaoMapsReady(appKey).catch((e) => logSdkError("[KakaoMap] warmup failed", e));
}
