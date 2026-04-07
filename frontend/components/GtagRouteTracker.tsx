"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendGtagPageView } from "@/lib/gtag";

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

/** gtag 초기화는 `@next/third-parties/google`의 GoogleAnalytics가 담당하고, 여기서는 클라이언트 라우트 전환 시 page_view만 보강합니다. */
export function GtagRouteTracker() {
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <Suspense fallback={null}>
      <GaPageViews />
    </Suspense>
  );
}
