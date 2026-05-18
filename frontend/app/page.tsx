import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import HomePageSkeleton from "@/components/HomePageSkeleton";
import HomeMapLcpDismiss from "@/components/home/HomeMapLcpDismiss";
import HomeMapLcpImage from "@/components/home/HomeMapLcpImage";
import HomeClient from "./HomeClient";
import { getHomePageMetadata } from "@/lib/storePageMetadata";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import { collectStoresWithinRadius, getStoreSearchIndexes } from "@/lib/server/storeIndex";
import type { StoreData } from "@/lib/storeData";
import { DEFAULT_REGION, type LatLng } from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

export const metadata: Metadata = getHomePageMetadata();

/** HTML TTFB — cookies() 제거로 ISR 가능, 1시간마다 갱신 */
export const revalidate = 3600;

const INITIAL_RADIUS_KM = 2;
const INITIAL_MAX_STORES = 60;

function buildInitialStoresAt(center: LatLng): StoreData[] {
  try {
    const idx = getStoreSearchIndexes();
    const candidates = collectStoresWithinRadius(
      idx,
      center.lat,
      center.lng,
      INITIAL_RADIUS_KM
    );
    return candidates
      .map((store) => ({
        ...store,
        distance: getDistanceKm(center.lat, center.lng, store.lat, store.lng)
      }))
      .filter((s) => (s.distance ?? Infinity) <= INITIAL_RADIUS_KM)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, INITIAL_MAX_STORES);
  } catch {
    return [];
  }
}

const getInitialStoresCached = unstable_cache(
  async () => buildInitialStoresAt(DEFAULT_REGION),
  ["home-initial-stores-v2"],
  { revalidate: 3600 }
);

export default function HomePage() {
  return (
    <>
      <HomeMapLcpImage />
      <HomeMapLcpDismiss />
      <p className="sr-only">
        {SITE_BRAND_KO}에서 종량제 봉투, 불연성마대, PP마대, 건설마대, 폐기물 스티커 판매처를 위치·주소·업체명으로 검색할
        수 있습니다.
      </p>
      <Suspense fallback={<HomePageSkeleton />}>
        <HomeStoresClient />
      </Suspense>
    </>
  );
}

async function HomeStoresClient() {
  const initialStores = await getInitialStoresCached();
  return <HomeClient initialStores={initialStores} />;
}
