"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_DEBUG, GA_MEASUREMENT_ID, sendGtagPageView } from "@/lib/gtag";

/**
 * layout에서 GA_ROUTE_TRACKER_ENABLED가 false면 마운트되지 않음 → 최초 page_view만
 * GoogleAnalyticsScripts로 측정되는지 분리해서 검증 가능.
 */
function GaPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstNavigation = useRef(true);
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !GA_MEASUREMENT_ID) return;

    const qs = searchKey;
    const path = qs ? `${pathname}?${qs}` : pathname;

    if (isFirstNavigation.current) {
      isFirstNavigation.current = false;
      if (GA_DEBUG) {
        console.log(
          "[GA] 첫 화면 page_view는 GoogleAnalyticsScripts만 — 경로:",
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
  if (process.env.NODE_ENV !== "production" || !GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <GaPageViews />
    </Suspense>
  );
}
