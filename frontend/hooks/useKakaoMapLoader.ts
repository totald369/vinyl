"use client";

/**
 * 카카오 지도 스크립트 로더.
 * ensureKakaoMapsReady 는 layout Script onLoad 와 공유 — maps.load() 를 React effect 전에 시작.
 */
import { useEffect, useMemo, useState } from "react";
import { ensureKakaoMapsReady, KAKAO_MAPS_READY_EVENT } from "@/lib/kakaoMapSdk";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";

type LoaderState = "idle" | "loading" | "ready" | "error";

type UseKakaoMapLoaderResult = {
  state: LoaderState;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
};

const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

function devLog(...args: unknown[]) {
  if (!DEV || typeof console === "undefined") return;
  console.info(...args);
}

function devError(...args: unknown[]) {
  if (!DEV || typeof console === "undefined") return;
  console.error(...args);
}

export function useKakaoMapLoader(options?: { enabled?: boolean }): UseKakaoMapLoaderResult {
  const enabled = options?.enabled !== false;
  const appKey = useMemo(() => process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "", []);
  /** SSR·첫 클라이언트 페인트 동일 — SDK 준비는 effect 에서만 반영 */
  const [state, setState] = useState<LoaderState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled) return;

    devLog("[KakaoMap] hook mount, key exists:", Boolean(appKey));
    setState("loading");
    setError(null);

    perfTimeStart("[perf] kakao-sdk-load");
    void ensureKakaoMapsReady(appKey)
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

  useEffect(() => {
    if (!enabled || state === "ready") return;
    const onReady = () => {
      setState("ready");
      setError(null);
    };
    window.addEventListener(KAKAO_MAPS_READY_EVENT, onReady);
    return () => window.removeEventListener(KAKAO_MAPS_READY_EVENT, onReady);
  }, [enabled, state]);

  return {
    state,
    isLoading: !enabled || state === "loading" || state === "idle",
    isReady: state === "ready",
    error
  };
}
