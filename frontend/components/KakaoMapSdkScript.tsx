"use client";

import Script from "next/script";

type Props = {
  appKey: string;
};

/**
 * head 동기 <script> 대신 afterInteractive — 렌더링 차단 제거.
 * useKakaoMapLoader 가 data-kakao-map-sdk 로 동일 태그를 인식해 maps.load() 호출.
 */
export default function KakaoMapSdkScript({ appKey }: Props) {
  if (!appKey.trim()) return null;

  const src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
    appKey
  )}&autoload=false`;

  return (
    <Script
      id="kakao-map-sdk"
      src={src}
      strategy="afterInteractive"
      data-kakao-map-sdk="true"
    />
  );
}
