/**
 * 전국 지역 선택 / URL 경로 매핑 및 주소 필터 바늘문자열.
 * - 매장 주소(소문자 blob)에 모든 needle이 포함되면 해당 지역으로 간주합니다.
 */

export type RegionDistrictDef = {
  slug: string;
  nameKo: string;
  needles: string[];
};

export type RegionCityDef = {
  slug: string;
  nameKo: string;
  districts?: RegionDistrictDef[];
  cityOnlyNeedles?: string[];
};

export type ProvinceDef = {
  slug: string;
  shortNameKo: string;
  nameKo: string;
  directDistricts?: RegionDistrictDef[];
  cities?: RegionCityDef[];
};

export type ResolvedRegionLeaf = {
  provinceSlug: string;
  shortNameKo: string;
  citySlug?: string;
  cityNameKo?: string;
  districtSlug?: string;
  districtNameKo?: string;
  needles: string[];
  headingLabelKo: string;
};

function r(slug: string, nameKo: string, needles: string[]): RegionDistrictDef {
  return { slug, nameKo, needles };
}

function seo(gu: string): string[] {
  return ["서울", gu];
}

const SEOUL_GU: RegionDistrictDef[] = [
  r("gangnam", "강남구", seo("강남구")),
  r("gangdong", "강동구", seo("강동구")),
  r("gangbuk", "강북구", seo("강북구")),
  r("gangseo", "강서구", seo("강서구")),
  r("gwanak", "관악구", seo("관악구")),
  r("gwangjin", "광진구", seo("광진구")),
  r("guro", "구로구", seo("구로구")),
  r("geumcheon", "금천구", seo("금천구")),
  r("nowon", "노원구", seo("노원구")),
  r("dobong", "도봉구", seo("도봉구")),
  r("dongdaemun", "동대문구", seo("동대문구")),
  r("dongjak", "동작구", seo("동작구")),
  r("mapo", "마포구", seo("마포구")),
  r("seodaemun", "서대문구", seo("서대문구")),
  r("seocho", "서초구", seo("서초구")),
  r("sdm", "성동구", seo("성동구")),
  r("sb", "성북구", seo("성북구")),
  r("songpa", "송파구", seo("송파구")),
  r("yangcheon", "양천구", seo("양천구")),
  r("yeongdeungpo", "영등포구", seo("영등포구")),
  r("yongsan", "용산구", seo("용산구")),
  r("eunpyeong", "은평구", seo("은평구")),
  r("jongno", "종로구", seo("종로구")),
  r("jung", "중구", seo("중구")),
  r("jungnang", "중랑구", seo("중랑구"))
];

function ig(slug: string, gu: string): RegionDistrictDef {
  return { slug, nameKo: gu, needles: ["인천", gu] };
}

const INCHEON_GU: RegionDistrictDef[] = [
  ig("ijung", "중구"),
  ig("idong", "동구"),
  ig("michuhol", "미추홀구"),
  ig("yeonsu", "연수구"),
  ig("namdong", "남동구"),
  ig("bupyong", "부평구"),
  ig("gyeyang", "계양구"),
  ig("iseo", "서구"),
  ig("ganghwa", "강화군"),
  ig("ongjin", "옹진군")
];

const GYEONGGI_CITIES: RegionCityDef[] = [
  {
    slug: "suwon",
    nameKo: "수원시",
    districts: [
      r("jangan", "장안구", ["경기", "수원", "장안구"]),
      r("gwonseon", "권선구", ["경기", "수원", "권선구"]),
      r("paldal", "팔달구", ["경기", "수원", "팔달구"]),
      r("yeongtong", "영통구", ["경기", "수원", "영통구"])
    ]
  },
  {
    slug: "seongnam",
    nameKo: "성남시",
    districts: [
      r("sujeong", "수정구", ["경기", "성남", "수정구"]),
      r("jungwon", "중원구", ["경기", "성남", "중원구"]),
      r("bundang", "분당구", ["경기", "성남", "분당구"])
    ]
  },
  {
    slug: "goyang",
    nameKo: "고양시",
    districts: [
      r("deogyang", "덕양구", ["경기", "고양", "덕양구"]),
      r("ilsandong", "일산동구", ["경기", "고양", "일산동구"]),
      r("ilsanseo", "일산서구", ["경기", "고양", "일산서구"])
    ]
  },
  {
    slug: "anyang",
    nameKo: "안양시",
    districts: [
      r("manan", "만안구", ["경기", "안양", "만안구"]),
      r("dongan", "동안구", ["경기", "안양", "동안구"])
    ]
  },
  { slug: "bucheon", nameKo: "부천시", cityOnlyNeedles: ["경기", "부천"] },
  {
    slug: "ansan",
    nameKo: "안산시",
    districts: [
      r("sangnok", "상록구", ["경기", "안산", "상록구"]),
      r("danwon", "단원구", ["경기", "안산", "단원구"])
    ]
  },
  { slug: "uijeongbu", nameKo: "의정부시", cityOnlyNeedles: ["경기", "의정부"] },
  { slug: "namyangju", nameKo: "남양주시", cityOnlyNeedles: ["경기", "남양주"] },
  { slug: "hwaseong", nameKo: "화성시", cityOnlyNeedles: ["경기", "화성"] },
  { slug: "pyeongtaek", nameKo: "평택시", cityOnlyNeedles: ["경기", "평택"] },
  { slug: "siheung", nameKo: "시흥시", cityOnlyNeedles: ["경기", "시흥"] },
  { slug: "paju", nameKo: "파주시", cityOnlyNeedles: ["경기", "파주"] },
  { slug: "gimpo", nameKo: "김포시", cityOnlyNeedles: ["경기", "김포"] },
  { slug: "gwangmyeong", nameKo: "광명시", cityOnlyNeedles: ["경기", "광명"] },
  { slug: "gg-gwangju", nameKo: "광주시", cityOnlyNeedles: ["경기", "광주시"] },
  { slug: "gunpo", nameKo: "군포시", cityOnlyNeedles: ["경기", "군포"] },
  { slug: "osan", nameKo: "오산시", cityOnlyNeedles: ["경기", "오산"] },
  { slug: "icheon-city", nameKo: "이천시", cityOnlyNeedles: ["경기", "이천"] },
  {
    slug: "yongin",
    nameKo: "용인시",
    districts: [
      r("cheoin", "처인구", ["경기", "용인", "처인구"]),
      r("giheung", "기흥구", ["경기", "용인", "기흥구"]),
      r("suji", "수지구", ["경기", "용인", "수지구"])
    ]
  }
];

function bg(slug: string, gu: string): RegionDistrictDef {
  return { slug, nameKo: gu, needles: ["부산", gu] };
}

const BUSAN_GU: RegionDistrictDef[] = [
  bg("bjung", "중구"),
  bg("bseo", "서구"),
  bg("bdong", "동구"),
  bg("yeongdo", "영도구"),
  bg("busanjin", "부산진구"),
  bg("dongnae", "동래구"),
  bg("bnam", "남구"),
  bg("bbuk", "북구"),
  bg("bgangseo", "강서구"),
  bg("haeundae", "해운대구"),
  bg("saha", "사하구"),
  bg("geumjeong", "금정구"),
  bg("sasang", "사상구"),
  bg("gijang", "기장군")
];

function dg(slug: string, gu: string): RegionDistrictDef {
  return { slug, nameKo: gu, needles: ["대구", gu] };
}

const DAEGU_GU: RegionDistrictDef[] = [
  dg("djung", "중구"),
  dg("ddong", "동구"),
  dg("dseo", "서구"),
  dg("nam-d", "남구"),
  dg("d-buk", "북구"),
  dg("suseong", "수성구"),
  dg("dalseo", "달서군"),
  dg("dalseong", "달성군")
];

/** 달서구 (행정구역명) */
const DAEGU_GU_FIXED: RegionDistrictDef[] = DAEGU_GU.map((x) =>
  x.slug === "dalseo"
    ? { slug: "dalseo", nameKo: "달서구", needles: ["대구", "달서구"] }
    : x
);

function gg(slug: string, gu: string): RegionDistrictDef {
  return { slug, nameKo: gu, needles: ["광주", gu] };
}

const GWANGJU_GU: RegionDistrictDef[] = [
  gg("g-dong", "동구"),
  gg("g-seo", "서구"),
  gg("g-nam", "남구"),
  gg("g-buk", "북구"),
  gg("gwangsan", "광산구")
];

function dj(slug: string, gu: string): RegionDistrictDef {
  return { slug, nameKo: gu, needles: ["대전", gu] };
}

const DAEJEON_GU: RegionDistrictDef[] = [
  dj("dj-dong", "동구"),
  dj("dj-jung", "중구"),
  dj("dj-seo", "서구"),
  dj("yuseong", "유성구"),
  dj("daedeok", "대덕구")
];

function us(slug: string, gu: string): RegionDistrictDef {
  return { slug, nameKo: gu, needles: ["울산", gu] };
}

const ULSAN_GU: RegionDistrictDef[] = [
  us("ujung", "중구"),
  us("nam-u", "남구"),
  us("dong-u", "동구"),
  us("buk-u", "북구"),
  us("ulju", "울주군")
];

/** 시·도 레벨: 피그마 좌측 열 순서 */
export const PROVINCES_ORDERED: ProvinceDef[] = [
  {
    slug: "seoul",
    shortNameKo: "서울",
    nameKo: "서울특별시",
    directDistricts: SEOUL_GU
  },
  {
    slug: "incheon",
    shortNameKo: "인천",
    nameKo: "인천광역시",
    directDistricts: INCHEON_GU
  },
  {
    slug: "gyeonggi",
    shortNameKo: "경기",
    nameKo: "경기도",
    cities: GYEONGGI_CITIES
  },
  {
    slug: "gangwon",
    shortNameKo: "강원",
    nameKo: "강원특별자치도",
    cities: [{ slug: "chuncheon", nameKo: "춘천시", cityOnlyNeedles: ["강원", "춘천"] }]
  },
  {
    slug: "daejeon",
    shortNameKo: "대전",
    nameKo: "대전광역시",
    directDistricts: DAEJEON_GU
  },
  {
    slug: "chungbuk",
    shortNameKo: "충북",
    nameKo: "충청북도",
    cities: [{ slug: "cheongju-cb", nameKo: "청주시", cityOnlyNeedles: ["충북", "청주"] }]
  },
  {
    slug: "chungnam",
    shortNameKo: "충남",
    nameKo: "충청남도",
    cities: [{ slug: "cheonan", nameKo: "천안시", cityOnlyNeedles: ["충남", "천안"] }]
  },
  {
    slug: "daegu",
    shortNameKo: "대구",
    nameKo: "대구광역시",
    directDistricts: DAEGU_GU_FIXED
  },
  {
    slug: "busan",
    shortNameKo: "부산",
    nameKo: "부산광역시",
    directDistricts: BUSAN_GU
  },
  {
    slug: "ulsan",
    shortNameKo: "울산",
    nameKo: "울산광역시",
    directDistricts: ULSAN_GU
  },
  {
    slug: "gyeongbuk",
    shortNameKo: "경북",
    nameKo: "경상북도",
    cities: [{ slug: "pohang-gb", nameKo: "포항시", cityOnlyNeedles: ["경북", "포항"] }]
  },
  {
    slug: "gyeongnam",
    shortNameKo: "경남",
    nameKo: "경상남도",
    cities: [{ slug: "changwon", nameKo: "창원시", cityOnlyNeedles: ["경남", "창원"] }]
  },
  {
    slug: "gwangju",
    shortNameKo: "광주",
    nameKo: "광주광역시",
    directDistricts: GWANGJU_GU
  },
  {
    slug: "jeonbuk",
    shortNameKo: "전북",
    nameKo: "전북특별자치도",
    cities: [{ slug: "jeonju", nameKo: "전주시", cityOnlyNeedles: ["전북", "전주"] }]
  },
  {
    slug: "jeonnam",
    shortNameKo: "전남",
    nameKo: "전라남도",
    cities: [{ slug: "yeosu", nameKo: "여수시", cityOnlyNeedles: ["전남", "여수"] }]
  },
  {
    slug: "jeju",
    shortNameKo: "제주",
    nameKo: "제주특별자치도",
    cities: [{ slug: "jeju-si", nameKo: "제주시", cityOnlyNeedles: ["제주", "제주시"] }]
  }
];

export const QUICK_REGION_LINKS: { label: string; path: string }[] = [
  { label: "강남구", path: "seoul/gangnam" },
  { label: "서초구", path: "seoul/seocho" },
  { label: "송파구", path: "seoul/songpa" },
  { label: "마포구", path: "seoul/mapo" },
  { label: "영등포구", path: "seoul/yeongdeungpo" },
  { label: "강동구", path: "seoul/gangdong" },
  { label: "동작구", path: "seoul/dongjak" },
  { label: "관악구", path: "seoul/gwanak" }
];

function metroHeading(prefix: string, gu: string): string {
  return `${prefix}${gu}`;
}

export function provinceBySlug(slug: string): ProvinceDef | undefined {
  return PROVINCES_ORDERED.find((p) => p.slug === slug);
}

/**
 * `/regions/[...segments]` 에서 세그먼트 배열을 해석합니다.
 */
export function resolveRegionLeafFromSlugPath(
  segmentsRaw: string[] | undefined
): ResolvedRegionLeaf | null {
  const segments = (segmentsRaw ?? []).map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return null;

  const p = provinceBySlug(segments[0] ?? "");
  if (!p) return null;

  if (p.directDistricts?.length) {
    if (segments.length < 2) return null;
    const dist = p.directDistricts.find((d) => d.slug === segments[1]);
    if (!dist) return null;
    const metro =
      p.slug === "seoul"
        ? "서울시 "
        : p.slug === "incheon"
          ? "인천시 "
          : p.slug === "daejeon"
            ? "대전시 "
            : p.slug === "daegu"
              ? "대구시 "
              : p.slug === "gwangju"
                ? "광주시 "
                : p.slug === "ulsan"
                  ? "울산시 "
                  : p.slug === "busan"
                    ? "부산시 "
                    : "";
    return {
      provinceSlug: p.slug,
      shortNameKo: p.shortNameKo,
      districtSlug: dist.slug,
      districtNameKo: dist.nameKo,
      needles: dist.needles,
      headingLabelKo: metroHeading(metro, dist.nameKo).replace(/\s+/g, " ").trim()
    };
  }

  if (p.cities?.length) {
    if (segments.length < 2) return null;
    const city = p.cities.find((c) => c.slug === segments[1]);
    if (!city) return null;
    if (city.cityOnlyNeedles?.length && (!city.districts || city.districts.length === 0)) {
      if (segments.length > 2) return null;
      return {
        provinceSlug: p.slug,
        shortNameKo: p.shortNameKo,
        citySlug: city.slug,
        cityNameKo: city.nameKo,
        needles: city.cityOnlyNeedles,
        headingLabelKo: `${p.shortNameKo} ${city.nameKo}`.trim()
      };
    }
    if (city.districts?.length) {
      if (segments.length < 3) return null;
      const dist = city.districts.find((d) => d.slug === segments[2]);
      if (!dist) return null;
      return {
        provinceSlug: p.slug,
        shortNameKo: p.shortNameKo,
        citySlug: city.slug,
        cityNameKo: city.nameKo,
        districtSlug: dist.slug,
        districtNameKo: dist.nameKo,
        needles: dist.needles,
        headingLabelKo: `${city.nameKo.replace(/시$/, "")}시 ${dist.nameKo}`.trim()
      };
    }
    return null;
  }

  return null;
}

/** API·초기 상태용 리전 경로 (슬래시 구분, 인코딩 없음). */
export function leafToRegionPath(leaf: ResolvedRegionLeaf): string {
  const segments = [leaf.provinceSlug];
  if (leaf.citySlug) segments.push(leaf.citySlug);
  if (leaf.districtSlug) segments.push(leaf.districtSlug);
  return segments.join("/");
}

/** resolve 후 경로 문자열 보정 */
export function regionHrefFromSegments(slugs: string[]): string {
  return `/regions/${slugs.map((s) => encodeURIComponent(s)).join("/")}`;
}

export function slugPathStringFromSegments(segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join("/");
}

/**
 * 모든 leaf 지역의 `/regions/...` pathname (canonical SEO·사이트맵용).
 */
export function enumerateRegionLeafPathnames(): string[] {
  const paths: string[] = [];
  for (const p of PROVINCES_ORDERED) {
    if (p.directDistricts?.length) {
      for (const d of p.directDistricts) {
        paths.push(regionHrefFromSegments([p.slug, d.slug]));
      }
    }
    if (p.cities?.length) {
      for (const c of p.cities) {
        const hasDistricts = Boolean(c.districts?.length);
        if (!hasDistricts && c.cityOnlyNeedles?.length) {
          paths.push(regionHrefFromSegments([p.slug, c.slug]));
        }
        if (hasDistricts && c.districts) {
          for (const dist of c.districts) {
            paths.push(regionHrefFromSegments([p.slug, c.slug, dist.slug]));
          }
        }
      }
    }
  }
  return paths;
}
