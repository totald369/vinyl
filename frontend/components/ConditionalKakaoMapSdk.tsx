"use client";

import { usePathname } from "next/navigation";
import KakaoMapSdkScript from "@/components/KakaoMapSdkScript";
import { pathnameNeedsKakaoMap } from "@/lib/kakaoMapRoutes";

type Props = { appKey: string };

export default function ConditionalKakaoMapSdk({ appKey }: Props) {
  const pathname = usePathname();
  if (!appKey.trim() || !pathnameNeedsKakaoMap(pathname)) {
    return null;
  }
  return <KakaoMapSdkScript appKey={appKey} />;
}
