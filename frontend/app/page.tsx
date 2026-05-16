import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import HomeClient from "./HomeClient";
import { getHomePageMetadata } from "@/lib/storePageMetadata";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import {
  collectStoresWithinRadius,
  getStoreSearchIndexes
} from "@/lib/server/storeIndex";
import type { StoreData } from "@/lib/storeData";
import { DEFAULT_REGION } from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

export const metadata: Metadata = getHomePageMetadata();

const INITIAL_RADIUS_KM = 2;
const INITIAL_MAX_STORES = 60;

/**
 * Server Component 에서 DEFAULT_REGION(강남) 기준 초기 매장 목록을 미리 직렬화해 client에 내려줌.
 *
 * 변경 전: HTML → JS hydration → 위치권한 → /api/stores fetch (waterfall) — 빈 화면이 길어짐.
 * 변경 후: 첫 페인트 시점에 강남 기준 반경 데이터가 이미 prop 으로 도착 → 위치 권한 응답 전에도
 *          기본 마커/리스트 렌더 가능. 사용자 위치가 생기면 useStores 가 그 시점에 갱신.
 *
 * 성능: getStoreSearchIndexes() 는 cold 시 수백 ms~1s+ — 매 요청마다 호출하면 모바일 첫 TTFB 폭증.
 * unstable_cache 로 동일 빌드 내 1회만 인덱스 구축·슬라이스 재사용 (revalidate: 배포 단위로 갱신).
 */
function buildInitialStoresUncached(): StoreData[] {
  try {
    const idx = getStoreSearchIndexes();
    const candidates = collectStoresWithinRadius(
      idx,
      DEFAULT_REGION.lat,
      DEFAULT_REGION.lng,
      INITIAL_RADIUS_KM
    );
    return candidates
      .map((store) => ({
        ...store,
        distance: getDistanceKm(
          DEFAULT_REGION.lat,
          DEFAULT_REGION.lng,
          store.lat,
          store.lng
        )
      }))
      .filter((s) => (s.distance ?? Infinity) <= INITIAL_RADIUS_KM)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, INITIAL_MAX_STORES);
  } catch {
    return [];
  }
}

const getInitialStoresCached = unstable_cache(
  async () => buildInitialStoresUncached(),
  ["home-initial-stores-v1"],
  { revalidate: 3600 }
);

export default async function HomePage() {
  const initialStores = await getInitialStoresCached();
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
        <HomeClient initialStores={initialStores} />
      </Suspense>
    </>
  );
}
