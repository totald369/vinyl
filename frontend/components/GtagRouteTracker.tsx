"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_DEBUG, GA_MEASUREMENT_ID, sendGtagPageView } from "@/lib/gtag";
import { shouldSendGa4Events } from "@/lib/analyticsEnvironment";

/**
 * App Router 경로·쿼리 변경마다 page_view 1회 (config send_page_view:false 전제).
 */
function GaPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSentPath = useRef<string | null>(null);
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (!shouldSendGa4Events() || !GA_MEASUREMENT_ID) return;

    const qs = searchKey;
    const path = qs ? `${pathname}?${qs}` : pathname;

    if (lastSentPath.current === path) return;
    lastSentPath.current = path;

    if (GA_DEBUG) {
      console.log("[GA] route page_view", path);
    }

    sendGtagPageView(path);
  }, [pathname, searchKey]);

  return null;
}

export function GtagRouteTracker() {
  if (!shouldSendGa4Events() || !GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <GaPageViews />
    </Suspense>
  );
}
