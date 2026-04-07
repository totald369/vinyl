"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendGtagPageView } from "@/lib/gtag";

/**
 * layout의 gtag('config')가 최초 page_view를 보냄.
 * 이후 pathname·쿼리가 바뀔 때만 gtag('config', id, { page_path })로 추가 page_view (중복 방지).
 */
function GaPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstNavigation = useRef(true);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    if (isFirstNavigation.current) {
      isFirstNavigation.current = false;
      return;
    }
    sendGtagPageView(path);
  }, [pathname, searchParams]);

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
