import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import RegionSeoFooter from "@/components/regions/RegionSeoFooter";
import RegionStoreListClient from "@/components/regions/RegionStoreListClient";
import RegionStoreListSkeleton from "@/components/regions/RegionStoreListSkeleton";
import { resolveRegionLeafFromSlugPath } from "@/lib/koreaRegions";
import { buildRegionStoreMetadata } from "@/lib/server/regionPageMetadata";
import { SITE_BRAND_KO } from "@/lib/seoBrand";

type PageProps = {
  params: { slug: string[] };
};

/**
 * 변경 전: page 가 Suspense fallback 만 렌더 → 클라이언트가 마운트 후 /api/stores fetch.
 * 변경 후: ISR 600초로 페이지 자체를 캐시(URL 단위), 동일 region 재방문은 origin 도달 0.
 *          - SSR 빌더가 storeIndex 를 직접 사용해 첫 페이지 데이터를 props 로 inline.
 *          - 클라이언트는 마운트 즉시 데이터 보유 → 첫 페인트에 리스트 표시.
 * 측정: TTFB·LCP·/api/stores?regionPath=... 호출 수.
 */
export const revalidate = 600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const leaf = resolveRegionLeafFromSlugPath(params.slug ?? []);
  if (!leaf) {
    return {
      title: `지역별 판매처 | ${SITE_BRAND_KO}`,
      description:
        "지역별 종량제 봉투·불연성마대·폐기물 스티커 판매처를 확인하세요."
    };
  }
  const pathname = `/regions/${(params.slug ?? []).map(encodeURIComponent).join("/")}`;
  return buildRegionStoreMetadata({
    headingLabelKo: leaf.headingLabelKo,
    pathname,
    leaf
  });
}

export default function RegionsLeafPage({ params }: PageProps) {
  const segs = params.slug ?? [];
  const leaf = resolveRegionLeafFromSlugPath(segs);
  if (!leaf) notFound();

  return (
    <>
      <Suspense fallback={<RegionStoreListSkeleton />}>
        <RegionStoreListClient leaf={leaf} slugSegments={segs} />
      </Suspense>
      <RegionSeoFooter leaf={leaf} />
    </>
  );
}
