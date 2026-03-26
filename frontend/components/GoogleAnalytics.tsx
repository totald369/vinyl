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

export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <Suspense fallback={null}>
      <GaPageViews />
    </Suspense>
  );
}
