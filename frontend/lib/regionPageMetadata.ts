import type { Metadata } from "next";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import { SITE_CANONICAL_HOST } from "@/lib/site";

export type RegionSeoCategory = "payBag" | "nonBurnable" | "largeSticker";

export function parseRegionCategoryParam(raw: string | undefined): RegionSeoCategory {
  const t = raw?.trim();
  if (t === "nonBurnable" || t === "largeSticker") return t;
  return "payBag";
}

export function regionCategoryKo(cat: RegionSeoCategory): string {
  switch (cat) {
    case "nonBurnable":
      return "불연성마대";
    case "largeSticker":
      return "대형폐기물스티커";
    default:
      return "종량제 봉투";
  }
}

export function buildRegionStoreMetadata(opts: {
  headingLabelKo: string;
  pathname: string;
  /** 카테고리 필터(UI·분석용). 고정 SERP 패턴에서는 제목 생성에 사용하지 않습니다. */
  category?: RegionSeoCategory;
}): Metadata {
  const title = `${opts.headingLabelKo} 종량제 봉투 판매처 | ${SITE_BRAND_KO}`;
  const description = `${opts.headingLabelKo}에서 종량제 봉투, 불연성마대, 폐기물 스티커 판매처를 확인하세요.`;
  const url = `https://${SITE_CANONICAL_HOST}${opts.pathname}`;
  const ogTitle = title;

  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: SITE_BRAND_KO,
      locale: "ko_KR",
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description
    },
    alternates: { canonical: opts.pathname }
  };
}

export function regionsPickerMetadata(): Metadata {
  const title = `지역으로 보기 | ${SITE_BRAND_KO}`;
  const description = `시·도와 시·군·구를 고른 뒤 종량제 봉투·불연성마대·폐기물 스티커 판매처를 지역별로 확인하세요.`;
  const pathname = "/regions";
  const url = `https://${SITE_CANONICAL_HOST}${pathname}`;
  return {
    title,
    description,
    openGraph: { title, description, url, siteName: SITE_BRAND_KO, locale: "ko_KR", type: "website" },
    twitter: { card: "summary", title, description },
    alternates: { canonical: pathname }
  };
}
