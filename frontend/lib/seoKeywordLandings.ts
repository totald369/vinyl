import type { ResolvedRegionLeaf } from "@/lib/koreaRegions";
import { leafToRegionPath, regionHrefFromSegments } from "@/lib/koreaRegions";
import type { RegionSeoCategory } from "@/lib/regionPageMetadata";
import type { Route } from "next";

/** `/seo/[slug]` 본문·내비용. 세부 지도·목록 데이터는 해당 regions 페이지에서만 제공합니다. */
export type SeoKeywordLandingDef = {
  slug: string;
  /** 페이지 H1 */
  headline: string;
  paragraphs: readonly string[];
  regionSegments: readonly string[];
  filter?: RegionSeoCategory;
};

export const SEO_KEYWORD_LANDING_PAGES: readonly SeoKeywordLandingDef[] = [
  {
    slug: "강남-종량제봉투",
    headline: "강남에서 종량제 봉투 판매처를 찾는 방법",
    regionSegments: ["seoul", "gangnam"],
    paragraphs: [
      "서울 강남구에서 종량제 봉투가 필요하면 먼저 일반적으로 판매하는 편의점·마트·철물점 등의 위치를 지도에서 비교하는 것이 시간을 아낄 수 있는 방법입니다.",
      "같은 판매처라도 종량제 봉투 종류·매대 비치 여부가 다를 수 있으니 방문 전 전화 확인을 권장합니다.",
      "불연성마대나 폐기물 스티커가 함께 필요하면 같은 화면에서 품목 필터만 바꿔 강남구 일대 판매처를 다시 모아 볼 수 있습니다.",
      "아래 버튼을 누르면 강남구 전용 데이터 화면으로 이동하며 실제 업체 이름·주소 등 지도 목록 형태를 바로 이용할 수 있습니다."
    ]
  },
  {
    slug: "덕양구-불연성마대",
    headline: "고양 덕양구 불연성마대 판매처 안내",
    regionSegments: ["gyeonggi", "goyang", "deogyang"],
    filter: "nonBurnable",
    paragraphs: [
      "경기 고양시 덕양구에서 불연성마대만 따로 필요할 때는 주소 검색 결과가 많지 않거나 일반 종량제 봉투만 노출되는 경우가 있어, 지역별로 모아본 판매처 목록을 참고하면 찾기 쉽습니다.",
      "불연성마대는 건설·리모델링 등 특정 폐기물 처리에 필요한데, 업체별로 재고·단가·규격이 다를 수 있으니 근처 몇 군데를 비교하는 편이 좋습니다.",
      "폐기물 스티커나 종량제 봉투가 함께 필요하면 한 번에 같은 지역에서 취급하는 곳만 골라볼 수 있도록 다른 품목 필터로 전환하면 됩니다.",
      "판매처의 실제 영업 상태는 변동할 수 있으니 방문·구매 전 항상 최신 정보를 확인해 주세요."
    ]
  },
  {
    slug: "송파구-종량제봉투",
    headline: "송파구 종량제 봉투 어디에서 살까요?",
    regionSegments: ["seoul", "songpa"],
    paragraphs: [
      "서울 송파구는 주거 단지와 상권이 함께 있어 종량제 봉투 판매처가 구역별로 흩어져 있습니다. 거리 순으로 목록과 지도 마커를 함께 보면 동선 계획이 수월합니다.",
      "종량제 봉투 외에 불연성마대가 필요하면 필터만 전환해서 같은 송파구 매장 목록만 다시 정렬된 상태로 확인할 수 있습니다.",
      "대형 가구 폐기 시 필요한 폐기물 스티커 역시 구청 안내 외에 가까운 판매처에서 구입 가능한 경우가 있어 쓰봉맵에서 위치별로 교차 확인해 보실 수 있습니다."
    ]
  },
  {
    slug: "마포구-폐기물스티커",
    headline: "마포구 폐기물 스티커·대형 폐기 안내",
    regionSegments: ["seoul", "mapo"],
    filter: "largeSticker",
    paragraphs: [
      "서울 마포구에서 대형 폐기물 처리를 준비 중이라면 지자체 규정에 맞는 폐기물 스티커(대형폐기물 스티커)를 구입해야 합니다.",
      "스티커를 파는 편의점·문구점 등의 위치는 생각보다 제한적일 수 있어, 마포구에 등록된 판매처만 모아 표시한 목록으로 찾아보세요.",
      "같은 판매처에서 종량제 봉투·불연성마대를 함께 취급하는 경우가 많으므로 한 번 들러 필요한 항목을 한꺼번에 확인하기에도 적합합니다."
    ]
  },
  {
    slug: "해운대구-종량제봉투",
    headline: "부산 해운대구 종량제 봉투 판매처 찾기",
    regionSegments: ["busan", "haeundae"],
    paragraphs: [
      "부산 해운대구는 관광·주거 상권이 섞여 있어 종량제 봉투 판매처가 바닷가 근처와 내륙 단지별로 분포합니다.",
      "지도에서 업체 마커를 눌러 주소와 취급 품목을 확인한 뒤 가까운 곳 순으로 방문 순서를 잡아 보세요.",
      "불연성마대나 폐기물 스티커가 필요한 경우 같은 지역 화면에서 필터만 바꿔 다시 검색 결과를 줄일 수 있습니다."
    ]
  },
  {
    slug: "분당구-불연성마대",
    headline: "성남 분당구 불연성마대 판매처",
    regionSegments: ["gyeonggi", "seongnam", "bundang"],
    filter: "nonBurnable",
    paragraphs: [
      "경기 성남시 분당구는 신도시 형태라 아파트 단지별로 근처 판매처가 달라질 수 있어 불연성마대만 검색했다가 헛걸음 하는 경우가 있습니다.",
      "불연성마대 필터와 분당구 지역 매칭이 적용된 목록에서는 실제 등록 매장 중심으로 위치만 좁혀 확인할 수 있습니다.",
      "종량제 봉투와 폐기물 스티커를 함께 알아두면 공사 후 정리 과정 전체에서 동선을 줄이는 데 도움이 됩니다."
    ]
  },
  {
    slug: "영등포구-종량제봉투",
    headline: "영등포구 종량제 봉투 판매처",
    regionSegments: ["seoul", "yeongdeungpo"],
    paragraphs: [
      "서울 영등포구 여의도·당산 일대 포함 상업 밀도가 높아 종량제 봉투 판매처가 역 주변과 주택가에 나뉘어 있습니다.",
      "거리가 가까워 보여도 길 하나 건너 더 가까운 곳에 매장이 있을 수 있으니 목록 거리 순 정렬과 지도를 함께 보는 편을 권합니다.",
      "불연성마대 또는 폐기물 스티커가 필요할 때 같은 화면에서 품목만 바꾸면 됩니다."
    ]
  },
  {
    slug: "부천시-종량제봉투",
    headline: "부천에서 종량제 봉투 판매처",
    regionSegments: ["gyeonggi", "bucheon"],
    paragraphs: [
      "경기 부천시는 행정 구역 이름이 크게 두드러지지 않아 지도 검색만으로 전체 매장 파악이 어렵습니다.",
      "부천 등록 판매처만 모아둔 지역 페이지에서는 종량제 봉투부터 불연성마대·폐기물 스티커까지 필터로 나눠 볼 수 있습니다.",
      "방문 전 영업 여부는 변동될 수 있으니 연락처가 있으면 확인하는 것이 좋습니다."
    ]
  },
  {
    slug: "수원-장안구-종량제봉투",
    headline: "수원 장안구 종량제 봉투 판매처",
    regionSegments: ["gyeonggi", "suwon", "jangan"],
    paragraphs: [
      "경기 수원시 장안구는 대학과 주거 단지 밀도가 높아 종량제 봉투 수요도 함께 높습니다.",
      "장안구만 지정해 등록 매장 목록과 지도를 보면 도보·차량 거리별로 선택하기 쉽습니다.",
      "불연성마대나 폐기물 스티커가 필요하면 동일 페이지에서 카테고리만 전환하면 됩니다."
    ]
  },
  {
    slug: "대구-수성구-종량제봉투",
    headline: "대구 수성구 종량제 봉투 어디서 사나요",
    regionSegments: ["daegu", "suseong"],
    paragraphs: [
      "대구광역시 수성구는 동성로·범어동 등 상권이 넓게 퍼져 있어 종량제 봉투 판매처도 지점별 분포가 고르지 않습니다.",
      "판매처 위치 정보를 거리 순으로 확인하면 접근 시간을 줄일 수 있습니다.",
      "불연성마대·폐기물 스티커가 필요하면 수성구 기준 같은 필터로 다시 검색 결과를 줄여 보실 수 있습니다."
    ]
  },
  {
    slug: "광주-광산구-불연성마대",
    headline: "광주 광산구 불연성마대 판매처",
    regionSegments: ["gwangju", "gwangsan"],
    filter: "nonBurnable",
    paragraphs: [
      "광주광역시 광산구는 신도시와 구도심 구역 차이가 있어 불연성마대 재고 차이도 날 수 있습니다.",
      "광산구 매장 데이터만 확인하면 일반 종량제 봉투 위주 매장까지 섞여 보기보다 필요한 카테고리에 집중할 수 있습니다.",
      "종량제 봉투나 폐기물 스티커를 함께 찾아야 할 때 같은 지역 링크 안에서 카테고리 필터만 바꾸세요."
    ]
  },
  {
    slug: "제주시-종량제봉투",
    headline: "제주시 종량제 봉투 판매처 안내",
    regionSegments: ["jeju", "jeju-si"],
    paragraphs: [
      "제주특별자치도 제주시 일대에서는 관광객 증가에 따라 종량제 봉투 필요 시점과 주변 상점 유형이 내륙과 다를 수 있습니다.",
      "제주시 기준 매장 목록에서 위치만 좁히고 마커로 비교하면 이동 동선 설정이 간단합니다.",
      "불연성마대·폐기물 스티커가 필요하면 동일 페이지에서 카테고리 전환 후 다시 지도를 이용해 주세요."
    ]
  }
] as const;

const BY_SLUG = new Map(SEO_KEYWORD_LANDING_PAGES.map((p) => [p.slug, p]));

export function getSeoKeywordLandingBySlug(raw: string | undefined): SeoKeywordLandingDef | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  try {
    const slug = decodeURIComponent(raw.trim());
    return BY_SLUG.get(slug);
  } catch {
    return BY_SLUG.get(raw.trim());
  }
}

export function seoKeywordLandingRegionHref(def: SeoKeywordLandingDef): Route {
  const path = regionHrefFromSegments([...def.regionSegments]);
  const f = def.filter;
  if (f != null && f !== "payBag") {
    return `${path}?filter=${encodeURIComponent(f)}` as Route;
  }
  return path as Route;
}

export function seoKeywordLandingPublicPath(slug: string): string {
  return `/seo/${encodeURIComponent(slug)}`;
}

function regionPathFromSegments(segs: readonly string[]): string {
  return segs.filter(Boolean).join("/");
}

export function seoLandingsSharingRegion(leaf: ResolvedRegionLeaf): readonly SeoKeywordLandingDef[] {
  const key = leafToRegionPath(leaf);
  return SEO_KEYWORD_LANDING_PAGES.filter((p) => regionPathFromSegments(p.regionSegments) === key);
}

/** 해당 지역과 직접 연결되는 SEO 페이지가 없을 때 상단 검색 허브에 쓰이는 교차 링크 */
export function sampleSeoLandingsExclusiveOf(slug?: string): readonly SeoKeywordLandingDef[] {
  const take = slug ? SEO_KEYWORD_LANDING_PAGES.filter((p) => p.slug !== slug) : [...SEO_KEYWORD_LANDING_PAGES];
  return take.slice(0, 6);
}
