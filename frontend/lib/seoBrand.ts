/** 서비스 표기용 브랜드명 (UI·메타·스키마 공통) */
export const SITE_BRAND_KO = "쓰봉맵";

/** SERP용 타이틀 본문(브랜드 제외). 스토어 상세 등에서 `쓰봉맵 | …` 앞에 붙일 때 사용 */
const SEO_META_TITLE_BODY_VARIANTS = [
  "종량제 봉투 어디서 사나요? 지금 구매 가능한 판매처 확인",
  "불연성마대 파는 곳 찾기 (헛걸음 없이 바로 확인)",
  "지금 종량제 봉투 살 수 있는 곳 찾기 (내 근처 바로 확인)"
] as const;

/**
 * SERP CTR용 메타 타이틀 (쓰봉맵 접두).
 * 페이지별로 variant 인덱스를 나눠 같은 문구만 과도하게 반복되지 않게 합니다.
 */
export const SEO_META_TITLE_VARIANTS = [
  `${SITE_BRAND_KO} | ${SEO_META_TITLE_BODY_VARIANTS[0]}`,
  `${SITE_BRAND_KO} | ${SEO_META_TITLE_BODY_VARIANTS[1]}`,
  `${SITE_BRAND_KO} | ${SEO_META_TITLE_BODY_VARIANTS[2]}`
] as const;

export function seoMetaTitleBodyForVariantIndex(i: SeoTitleVariantIndex): string {
  return SEO_META_TITLE_BODY_VARIANTS[i];
}

/** variant와 동일 인덱스로 맞춘 메타 설명 (지금·바로·헛걸음 없이 포함) */
export const SEO_META_DESCRIPTION_BY_VARIANT = [
  "종량제 봉투·불연성마대·폐기물 스티커 판매처를 지금 바로 찾고 싶다면 쓰봉맵에서 지도와 검색으로 확인하세요. 헛걸음 없이 근처 매장 주소와 취급 품목을 한 화면에서 비교할 수 있습니다.",
  "불연성마대·종량제 봉투를 어디서 사야 할지 막막할 때, 쓰봉맵이 바로 답을 보여 드립니다. 지금 살 수 있는 판매처 위치를 지도에서 찾고 방문 동선까지 짜 보세요. 헛걸음 줄이는 데 집중했습니다.",
  "지금 종량제 봉투를 살 수 있는 판매처를 바로 찾고 싶다면 쓰봉맵에서 주소·업체명 검색과 거리순 정렬로 헛걸음 없이 매장을 고를 수 있습니다. 내 근처 동선에 맞춰 지도에서 바로 비교해 보세요."
] as const;

export type SeoTitleVariantIndex = 0 | 1 | 2;

function hashPath(pathname: string): number {
  let h = 2166136261;
  for (let i = 0; i < pathname.length; i++) {
    h = Math.imul(h ^ pathname.charCodeAt(i), 16777619);
  }
  return Math.abs(h);
}

/**
 * 주요 라우트는 의도적으로 0/1/2를 나누고, 그 외는 경로 해시로 분산합니다.
 */
export function seoTitleVariantIndexForPath(pathname: string): SeoTitleVariantIndex {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const explicit: Record<string, SeoTitleVariantIndex> = {
    "/": 0,
    "/gangnam-trashbag": 1,
    "/songpa-trashbag": 2,
    "/gangdong-trashbag": 0,
    "/stores": 1,
    "/gangnam": 2,
    "/report": 0,
    "/edit-request": 1,
    "/report/success": 2,
    "/edit-request/success": 0
  };
  const hit = explicit[p];
  if (hit !== undefined) return hit;
  return (hashPath(p) % 3) as SeoTitleVariantIndex;
}

export function seoAbsoluteMetaTitleForPath(pathname: string): string {
  const i = seoTitleVariantIndexForPath(pathname);
  return SEO_META_TITLE_VARIANTS[i];
}

export function seoMetaDescriptionForPath(pathname: string): string {
  const i = seoTitleVariantIndexForPath(pathname);
  return SEO_META_DESCRIPTION_BY_VARIANT[i];
}

/** OG 기본 이미지 (opengraph-image 라우트, 기존 에셋 유지) */
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image";
export const DEFAULT_OG_IMAGE_ALT = `${SITE_BRAND_KO} — 종량제 봉투·불연성마대·폐기물 스티커 판매처 지도`;

export const defaultOpenGraphImage = {
  url: DEFAULT_OG_IMAGE_PATH,
  width: 1200,
  height: 630,
  alt: DEFAULT_OG_IMAGE_ALT
} as const;
