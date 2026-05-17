"use client";

import Script from "next/script";
import { buildKakaoMapSdkUrl, ensureKakaoMapsReady } from "@/lib/kakaoMapSdk";

type Props = {
  appKey: string;
};

/**
 * layout head 의 sdk preload + afterInteractive 로드.
 * useKakaoMapLoader 가 data-kakao-map-sdk 로 동일 태그를 인식해 maps.load() 호출.
 */
export default function KakaoMapSdkScript({ appKey }: Props) {
  if (!appKey.trim()) return null;

  const src = buildKakaoMapSdkUrl(appKey);

  return (
    <Script
      id="kakao-map-sdk"
      src={src}
      strategy="afterInteractive"
      data-kakao-map-sdk="true"
      onLoad={() => {
        document.getElementById("kakao-map-sdk")?.setAttribute("data-loaded", "true");
        void ensureKakaoMapsReady(appKey);
      }}
    />
  );
}
