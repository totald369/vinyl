"use client";

import { ensureKakaoMapsReady } from "@/lib/kakaoMapSdk";

export async function loadKakaoMaps(appKey: string): Promise<void> {
  await ensureKakaoMapsReady(appKey);
}
