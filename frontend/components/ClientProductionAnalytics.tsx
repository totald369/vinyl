"use client";

import { useEffect, useState } from "react";
import { isProductionAnalyticsHost } from "@/lib/analyticsEnvironment";
import { GA_MEASUREMENT_ID, GA_ROUTE_TRACKER_ENABLED } from "@/lib/gtag";
import { DelayedAnalyticsScripts } from "@/components/DelayedAnalyticsScripts";
import { GtagRouteTracker } from "@/components/GtagRouteTracker";
import { TrafficAttributionInit } from "@/components/TrafficAttributionInit";
import { CLARITY_PROJECT_ID } from "@/lib/clarity";

type Props = {
  /** production 빌드에서 GA·Clarity 스크립트 로드 허용 (호스트는 별도 검사) */
  loadScripts?: boolean;
};

/**
 * www.trashbagmap.com 에서만 GA·Clarity 스크립트 로드.
 * localhost·Vercel preview에서는 attribution 디버그만, GA 전송 없음.
 */
export function ClientProductionAnalytics({ loadScripts = false }: Props) {
  const [hostOk, setHostOk] = useState(false);

  useEffect(() => {
    setHostOk(isProductionAnalyticsHost());
  }, []);

  const scriptsActive = loadScripts && hostOk;
  const loadGa = scriptsActive && Boolean(GA_MEASUREMENT_ID);
  const loadClarity = scriptsActive && Boolean(CLARITY_PROJECT_ID);

  return (
    <>
      <TrafficAttributionInit />
      {loadGa && GA_ROUTE_TRACKER_ENABLED ? <GtagRouteTracker /> : null}
      {loadGa || loadClarity ? <DelayedAnalyticsScripts /> : null}
    </>
  );
}
