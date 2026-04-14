import type { Metadata } from "next";
import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { getHomePageMetadata } from "@/lib/storePageMetadata";
import { SITE_BRAND_KO } from "@/lib/seoBrand";

export const metadata: Metadata = getHomePageMetadata();

export default function HomePage() {
  return (
    <>
      <p className="sr-only">
        {SITE_BRAND_KO}에서 종량제 봉투, 불연성마대, PP마대, 건설마대, 폐기물 스티커 판매처를 위치·주소·업체명으로 검색할
        수 있습니다.
      </p>
      <Suspense
        fallback={
          <main className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-bg-canvas" aria-hidden />
        }
      >
        <HomeClient />
      </Suspense>
    </>
  );
}
