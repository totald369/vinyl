import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import RegionSeoFooter from "@/components/regions/RegionSeoFooter";
import RegionStoreListClient from "@/components/regions/RegionStoreListClient";
import { resolveRegionLeafFromSlugPath } from "@/lib/koreaRegions";
import { buildRegionStoreMetadata } from "@/lib/regionPageMetadata";
import { SITE_BRAND_KO } from "@/lib/seoBrand";

type PageProps = {
  params: { slug: string[] };
};

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
    pathname
  });
}

export default function RegionsLeafPage({ params }: PageProps) {
  const segs = params.slug ?? [];
  const leaf = resolveRegionLeafFromSlugPath(segs);
  if (!leaf) notFound();
  return (
    <>
      <Suspense
        fallback={<main className="mx-auto min-h-[100dvh] max-w-md bg-bg-canvas" aria-hidden />}
      >
        <RegionStoreListClient leaf={leaf} slugSegments={segs} />
      </Suspense>
      <RegionSeoFooter leaf={leaf} />
    </>
  );
}
