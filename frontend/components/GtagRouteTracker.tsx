"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_DEBUG, sendGtagPageView } from "@/lib/gtag";

/**
 * 최초 로드: layout의 gtag('config')가 자동 page_view 1회.
 * 이후: pathname·search 변경 시에만 sendGtagPageView (중복 방지).
 *
 * 테스트: 클라이언트 네비 후 Network에 추가 collect / Console에 [GA] page_view (route)
 */
function GaPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstNavigation = useRef(true);
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const qs = searchKey;
    const path = qs ? `${pathname}?${qs}` : pathname;

    if (isFirstNavigation.current) {
      isFirstNavigation.current = false;
      if (GA_DEBUG) {
        console.log(
          "[GA] 첫 화면은 GoogleAnalyticsScripts의 gtag(config) page_view에 맡김 — 경로:",
          path,
          "(여기서는 전송 안 함)"
        );
      }
      return;
    }

    sendGtagPageView(path);
  }, [pathname, searchKey]);

  return null;
}

export function GtagRouteTracker() {
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <Suspense fallback={null}>
      <GaPageViews />
    </Suspense>
  );
}
