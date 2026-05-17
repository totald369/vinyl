"use client";

import Script from "next/script";
import { installAllKakaoSdrPatches } from "@/lib/kakao/installKakaoSdrPatches";
import {
  buildKakaoMapSdkUrl,
  ensureKakaoMapsReady,
  startKakaoMapsWarmup
} from "@/lib/kakaoMapSdk";

type Props = {
  appKey: string;
};

/**
 * layout head preload + beforeInteractive — hydration 전 SDK 다운로드·maps.load 시작.
 */
export default function KakaoMapSdkScript({ appKey }: Props) {
  if (!appKey.trim()) return null;

  if (typeof window !== "undefined") {
    installAllKakaoSdrPatches();
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      });
    }
    startKakaoMapsWarmup(appKey);
  }

  const src = buildKakaoMapSdkUrl(appKey);

  return (
    <Script
      id="kakao-map-sdk"
      src={src}
      strategy="beforeInteractive"
      data-kakao-map-sdk="true"
      onLoad={() => {
        document.getElementById("kakao-map-sdk")?.setAttribute("data-loaded", "true");
        void ensureKakaoMapsReady(appKey);
      }}
    />
  );
}
