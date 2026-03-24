"use client";

export async function loadKakaoMaps(appKey: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (!appKey) {
    throw new Error("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다.");
  }

  if (window.kakao?.maps) {
    await new Promise<void>((resolve) => window.kakao.maps.load(() => resolve()));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  });
}
