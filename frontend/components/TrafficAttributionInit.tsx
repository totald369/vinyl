"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { shouldLogAnalyticsDebug } from "@/lib/analyticsEnvironment";
import {
  captureTrafficAttribution,
  markTrafficAttributionEventSent,
  toTrafficAttributionEventPayload
} from "@/lib/trafficAttribution";

/**
 * 최초 랜딩 attribution 저장 + traffic_attribution_detected 1회 전송.
 */
export function TrafficAttributionInit() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const record = captureTrafficAttribution();

    if (!markTrafficAttributionEventSent()) {
      return;
    }

    const payload = toTrafficAttributionEventPayload(record);
    trackEvent("traffic_attribution_detected", payload);

    if (shouldLogAnalyticsDebug()) {
      console.debug("[traffic-attribution]", payload);
    }
  }, []);

  return null;
}
