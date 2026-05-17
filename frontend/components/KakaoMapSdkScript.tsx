"use client";

import Script from "next/script";
import {
  buildKakaoMapSdkUrl,
  ensureKakaoMapsReady,
  KAKAO_MAP_SDK_SCRIPT_ID,
  startKakaoMapsWarmup
} from "@/lib/kakaoMapSdk";

type Props = {
  appKey: string;
};

/**
 * layout — hydration 전 SDK 다운로드·maps.load 시작 (지도 타일 LCP).
 * SW 등록은 ServiceWorkerRegister 가 전담.
 */
export default function KakaoMapSdkScript({ appKey }: Props) {
  if (!appKey.trim()) return null;

  if (typeof window !== "undefined") {
    startKakaoMapsWarmup(appKey);
  }

  const src = buildKakaoMapSdkUrl(appKey);

  return (
    <Script
      id={KAKAO_MAP_SDK_SCRIPT_ID}
      src={src}
      strategy="beforeInteractive"
      data-kakao-map-sdk="true"
      onLoad={() => {
        document.getElementById(KAKAO_MAP_SDK_SCRIPT_ID)?.setAttribute("data-loaded", "true");
        void ensureKakaoMapsReady(appKey);
      }}
    />
  );
}
