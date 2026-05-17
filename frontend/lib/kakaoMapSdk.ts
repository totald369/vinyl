/** 카카오 지도 JS SDK URL (layout preload · Script · useKakaoMapLoader 공통) */
export function buildKakaoMapSdkUrl(appKey: string): string {
  return `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
    appKey
  )}&autoload=false`;
}
