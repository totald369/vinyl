"use client";

/**
 * 카카오 지도 스크립트 로더.
 *
 * 변경 전: 프로덕션에서도 과도한 console.info 로그 및 clusterer 라이브러리 미포함.
 * 변경 후: production 시 로그 차단(+ next.config compiler.removeConsole 병행 가능),
 *          clusterer 라이브러리 파라미터로 마커 밀도 대응.
 * 측정: 크롬 Performance Main 스레드 시간, 번들 실행 시 문자열/format 비용(ms).
 */
import { useEffect, useMemo, useState } from "react";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";

type LoaderState = "idle" | "loading" | "ready" | "error";

type UseKakaoMapLoaderResult = {
  state: LoaderState;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
};

let sdkLoadPromise: Promise<void> | null = null;

const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

function devLog(...args: unknown[]) {
  if (!DEV || typeof console === "undefined") return;
  console.info(...args);
}

function devError(...args: unknown[]) {
  if (typeof console === "undefined") return;
  console.error(...args);
}

/**
 * SDK 엔드포인트.
 * 변경 전: `&libraries=clusterer` 포함 → MapView가 clusterer를 안 쓰는데도
 *          ~40KB 추가 다운로드 + 추가 평가 비용.
 * 변경 후: 미사용 라이브러리 제거 — 첫 지도 렌더 전 네트워크/메인 스레드 단축.
 * 측정: Network에서 sdk.js 응답 크기 / Performance Main thread "Compile script" 시간.
 */
function sdkSrc(appKey: string): string {
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
    appKey
  )}&autoload=false`;
}

function loadKakaoSdk(appKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  devLog(`[KakaoMap] env key exists: ${appKey ? "yes" : "no"}`);
  if (!appKey) {
    devError("[KakaoMap] env missing: NEXT_PUBLIC_KAKAO_MAP_APP_KEY");
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다."));
  }

  const srcUrl = sdkSrc(appKey);

  if (window.kakao?.maps) {
    devLog("[KakaoMap] sdk already present on window");
    return new Promise<void>((resolve) => {
      window.kakao.maps.load(() => resolve());
    });
  }

  if (sdkLoadPromise) {
    devLog("[KakaoMap] reuse in-flight sdk load promise");
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(
      "script[data-kakao-map-sdk='true']"
    ) as HTMLScriptElement | null;

    if (existingScript && existingScript.src.includes("dapi.kakao.com")) {
      existingScript.addEventListener("load", () => {
        if (window.kakao?.maps) {
          window.kakao.maps.load(() => resolve());
        } else {
          reject(new Error("카카오맵 SDK 초기화 실패"));
        }
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("카카오맵 SDK 로드 실패"));
      });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.kakaoMapSdk = "true";
    script.src = srcUrl;
    script.onload = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => resolve());
      } else {
        reject(new Error("카카오맵 SDK 초기화 실패"));
      }
    };
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoadPromise = null;
    throw error;
  });

  return sdkLoadPromise;
}

export function useKakaoMapLoader(options?: { enabled?: boolean }): UseKakaoMapLoaderResult {
  const enabled = options?.enabled !== false;
  const appKey = useMemo(() => process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "", []);
  const [state, setState] = useState<LoaderState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled) return;

    devLog("[KakaoMap] hook mount, key exists:", Boolean(appKey));
    setState("loading");
    setError(null);

    perfTimeStart("[perf] kakao-sdk-load");
    void loadKakaoSdk(appKey)
      .then(() => {
        devLog("[KakaoMap] sdk ready");
        perfTimeEnd("[perf] kakao-sdk-load");
        setState("ready");
      })
      .catch((e) => {
        devError("[KakaoMap] sdk failed", e);
        perfTimeEnd("[perf] kakao-sdk-load");
        setState("error");
        setError(e instanceof Error ? e.message : "카카오맵 로드 오류");
      });
  }, [appKey, enabled]);

  return {
    state,
    isLoading: !enabled || state === "loading" || state === "idle",
    isReady: state === "ready",
    error
  };
}
