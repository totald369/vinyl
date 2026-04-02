import { seoMetaDescriptionForPath } from "@/lib/seoBrand";
import type { LatLng } from "@/lib/types";

/** URL 한 세그먼트: /gangnam-trashbag */
export type DistrictTrashbagSlug =
  | "gangnam-trashbag"
  | "songpa-trashbag"
  | "gangdong-trashbag";

export type DistrictTrashbagConfig = {
  slug: DistrictTrashbagSlug;
  /** H1·문구용 (예: 강남구) */
  labelGu: string;
  /** 자연어 변형용 짧은 호칭 (예: 강남) */
  labelShort: string;
  /** stores JSON 주소 매칭 (예: 강남구) */
  addressKeyword: string;
  mapCenter: LatLng;
  /** 구 중심 기준 대략 반경(km). 미주면 전 구간 매장 표시 */
  listRadiusKm?: number | null;
};

export const DISTRICT_TRASHBAG_PAGES: DistrictTrashbagConfig[] = [
  {
    slug: "gangnam-trashbag",
    labelGu: "강남구",
    labelShort: "강남",
    addressKeyword: "강남구",
    mapCenter: { lat: 37.4979, lng: 127.0276 },
    listRadiusKm: null
  },
  {
    slug: "songpa-trashbag",
    labelGu: "송파구",
    labelShort: "송파",
    addressKeyword: "송파구",
    mapCenter: { lat: 37.5145, lng: 127.1058 },
    listRadiusKm: null
  },
  {
    slug: "gangdong-trashbag",
    labelGu: "강동구",
    labelShort: "강동",
    addressKeyword: "강동구",
    mapCenter: { lat: 37.5301, lng: 127.1238 },
    listRadiusKm: null
  }
];

const SLUG_SET = new Set<string>(DISTRICT_TRASHBAG_PAGES.map((d) => d.slug));

export function isDistrictTrashbagSlug(s: string): s is DistrictTrashbagSlug {
  return SLUG_SET.has(s);
}

export function getDistrictTrashbagConfig(
  slug: string
): DistrictTrashbagConfig | undefined {
  return DISTRICT_TRASHBAG_PAGES.find((d) => d.slug === slug);
}

/** 요구사항 고정 문단 */
export function districtIntroLeadParagraph(labelGu: string): string {
  return `${labelGu}의 종량제 봉투와 불연성마대를 구매할 수 있는 판매처를 지도 기반으로 확인할 수 있어요.`;
}

/** 페이지별 추가 설명 (중복 콘텐츠 완화) */
export function buildDistrictExtraIntro(cfg: DistrictTrashbagConfig): string {
  const { labelGu, labelShort } = cfg;
  const idx = DISTRICT_TRASHBAG_PAGES.findIndex((d) => d.slug === cfg.slug);
  const variants = [
    `가까운 편의점·마트·철물점 등 ${labelShort} 실제 판매점 위치를 거리순으로 살펴보세요. 지도 마커를 누르면 주소와 취급 품목을 바로 확인할 수 있습니다.`,
    `${labelGu}에서 ‘불연성마대 파는곳’만 찾을 때는 목록 상단 필터에서 불연성 마대를 선택하세요. 데이터는 공개 목록을 기반으로 하며 영업 여부는 방문 전 재확인을 권장합니다.`,
    `종량제 봉투 판매처와 함께 폐기물 스티커·PP마대 등 다른 품목이 필요하면 필터를 바꿔 ${labelShort} 권역 매장만 모아볼 수 있습니다. 서울 다른 구는 아래 지역 링크에서 열 수 있어요.`
  ];
  return variants[idx % variants.length];
}

/** SERP용 description: 구 이름 + 공통 variant 설명(지금·바로·헛걸음 없이·쓰봉맵) */
export function districtSeoDescription(cfg: DistrictTrashbagConfig): string {
  const path = `/${cfg.slug}`;
  return `${cfg.labelGu}에서 ${seoMetaDescriptionForPath(path)}`;
}

/** H1: SEO 키워드 중심 (구·품목 조합을 페이지마다 달리) */
export function districtTrashbagH1(cfg: DistrictTrashbagConfig): string {
  const bySlug: Record<DistrictTrashbagSlug, string> = {
    "gangnam-trashbag": `${cfg.labelShort} 종량제 봉투 판매처`,
    "songpa-trashbag": `${cfg.labelShort} 불연성마대 판매처`,
    "gangdong-trashbag": `${cfg.labelGu} 종량제 봉투 판매처`
  };
  return bySlug[cfg.slug];
}
