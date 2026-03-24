"use client";

import { useEffect, useMemo, useState } from "react";

type LoaderState = "idle" | "loading" | "ready" | "error";

type UseKakaoMapLoaderResult = {
  state: LoaderState;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
};

let sdkLoadPromise: Promise<void> | null = null;

function loadKakaoSdk(appKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  console.info(`[KakaoMap] env key exists: ${appKey ? "yes" : "no"}`);
  if (!appKey) {
    console.error("[KakaoMap] env missing: NEXT_PUBLIC_KAKAO_MAP_APP_KEY");
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다."));
  }

  if (window.kakao?.maps) {
    console.info("[KakaoMap] sdk already present on window");
    return new Promise<void>((resolve) => {
      window.kakao.maps.load(() => resolve());
    });
  }

  if (sdkLoadPromise) {
    console.info("[KakaoMap] reuse in-flight sdk load promise");
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const sdkUrl = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    console.info(`[KakaoMap] final sdk url: ${sdkUrl}`);

    const existingScript = document.querySelector(
      "script[data-kakao-map-sdk='true']"
    ) as HTMLScriptElement | null;

    if (existingScript) {
      console.info(`[KakaoMap] existing script src: ${existingScript.src}`);
      existingScript.addEventListener("load", () => {
        console.info("[KakaoMap] script loaded (existing script)");
        console.info(`[KakaoMap] window.kakao exists: ${window.kakao ? "yes" : "no"}`);
        if (window.kakao?.maps) {
          console.info("[KakaoMap] sdk loaded from existing script tag");
          window.kakao.maps.load(() => resolve());
        } else {
          reject(new Error("카카오맵 SDK 초기화 실패"));
        }
      });
      existingScript.addEventListener("error", () => {
        console.error(`[KakaoMap] script failed (existing script): ${existingScript.src}`);
        reject(new Error("카카오맵 SDK 로드 실패"));
      });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.kakaoMapSdk = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    console.log("KAKAO SDK URL:", script.src);
    script.onload = () => {
      console.log("[KakaoMap] script loaded");
      console.log("[KakaoMap] window.kakao exists:", Boolean(window.kakao));
      if (window.kakao?.maps) {
        console.info("[KakaoMap] sdk loaded successfully");
        window.kakao.maps.load(() => resolve());
      } else {
        console.error("[KakaoMap] sdk script loaded but window.kakao.maps is unavailable");
        reject(new Error("카카오맵 SDK 초기화 실패"));
      }
    };
    script.onerror = (event) => {
      console.log("[KakaoMap] script failed");
      console.error("[KakaoMap] failed script src:", script.src);
      console.error("[KakaoMap] browser error context:", event);
      reject(new Error("카카오맵 SDK 로드 실패"));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoadPromise = null;
    throw error;
  });

  return sdkLoadPromise;
}

export function useKakaoMapLoader(): UseKakaoMapLoaderResult {
  const appKey = useMemo(() => process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "", []);
  const [state, setState] = useState<LoaderState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    console.info(
      `[KakaoMap] env exists: ${appKey ? "yes" : "no"} (NEXT_PUBLIC_KAKAO_MAP_APP_KEY)`
    );
    setState("loading");
    setError(null);

    void loadKakaoSdk(appKey)
      .then(() => {
        console.info("[KakaoMap] sdk ready");
        setState("ready");
      })
      .catch((e) => {
        console.error("[KakaoMap] sdk failed", e);
        setState("error");
        setError(e instanceof Error ? e.message : "카카오맵 로드 오류");
      });
  }, [appKey]);

  return {
    state,
    isLoading: state === "loading" || state === "idle",
    isReady: state === "ready",
    error
  };
}
