"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import MapLcpPlaceholder from "@/components/MapLcpPlaceholder";
import MapSkeleton from "@/components/MapSkeleton";

type Props = {
  children: ReactNode;
  kakaoLoading?: boolean;
  className?: string;
  id?: string;
};

/**
 * SSR HTML 과 첫 클라이언트 렌더를 맞춘 뒤, hydration 이후에만 지도(MapView) 마운트.
 */
export default function ClientMountedMapShell({
  children,
  kakaoLoading = false,
  className = "kakao-map-root relative h-full w-full",
  id = "kakao-map"
}: Props) {
  const [mounted, setMounted] = useState(false);

  /** useLayoutEffect — paint 전 지도 마운트로 첫 진입 마커 지연 완화 */
  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div id={id} className={className}>
      <MapLcpPlaceholder />
      {mounted ? (
        <>
          {children}
          {kakaoLoading ? <MapSkeleton overlay /> : null}
        </>
      ) : (
        <MapSkeleton overlay />
      )}
    </div>
  );
}
