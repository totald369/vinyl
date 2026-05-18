"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div id={id} className={className}>
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
