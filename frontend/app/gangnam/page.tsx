import Link from "next/link";
import type { Metadata } from "next";
import {
  DEFAULT_OG_IMAGE_ALT,
  SITE_BRAND_KO,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath,
  seoMetaDescriptionForPath
} from "@/lib/seoBrand";

const PAGE_PATH = "/gangnam";
const PAGE_TITLE = seoAbsoluteMetaTitleForPath(PAGE_PATH);
const PAGE_DESCRIPTION = seoMetaDescriptionForPath(PAGE_PATH);

export const metadata: Metadata = {
  alternates: { canonical: PAGE_PATH },
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_PATH,
    siteName: SITE_BRAND_KO,
    images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [defaultOpenGraphImage.url],
  },
};

export default function GangnamPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-8">
      <nav aria-label="관련 페이지" className="text-sm text-slate-600">
        <Link href="/">{SITE_BRAND_KO} 홈</Link>
        {" · "}
        <Link href="/stores">판매처 목록</Link>
      </nav>
      <h1 className="text-xl font-bold">강남 종량제 봉투 판매처</h1>
      <p className="text-sm text-slate-600">
        강남 지역에서 종량제 봉투를 구매할 수 있는 판매처를 찾고 계신가요? 종량제 봉투는 생활쓰레기를 버릴 때 반드시
        사용하는 정부 인증 봉투로, 지정된 판매점에서만 구입할 수 있습니다. {SITE_BRAND_KO} 지도에서는 내 위치를 기준으로
        주변 강남 종량제 봉투 파는 곳을 지금 바로 찾아볼 수 있습니다.
      </p>
      <p className="text-sm text-slate-600">
        일부 구에서는 불연성 폐기물을 담기 위한 불연성마대 판매처도 함께 안내됩니다. 대형 폐기물을 배출할 때 필요한
        폐기물 스티커 구매가 가능한 곳도 지도에서 확인해 보세요. 헛걸음 없이 방문하기 전에 바로 위치를 확인하세요.
      </p>
      <p className="text-sm text-slate-600">
        실제 매장 위치·영업 여부는 지자체 및 사업자 안내를 함께 확인하시기 바랍니다.
      </p>
      <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        {SITE_BRAND_KO}
      </footer>
    </main>
  );
}
