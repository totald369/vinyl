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
  /** `districts`가 있을 때 `/도/시` 두 세그먼트(시 전체) URL·필터용 */
  legacyCityWideNeedles?: string[];
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

/** 시·군 단위(구 없음): 주소 문자열에 provinceNeedle·cityNeedle가 함께 포함되면 매칭 */
function cityOnly(slug: string, nameKo: string, provinceNeedle: string, cityNeedle: string): RegionCityDef {
  return { slug, nameKo, cityOnlyNeedles: [provinceNeedle, cityNeedle] };
}

/** 자치구가 있는 시: `districts` + 기존 `/도/시` 두 세그먼트 URL용 `legacyCityWideNeedles` */
function cityWithDistricts(
  slug: string,
  nameKo: string,
  legacyWide: [string, string],
  districts: RegionDistrictDef[]
): RegionCityDef {
  return {
    slug,
    nameKo,
    districts,
    legacyCityWideNeedles: [legacyWide[0], legacyWide[1]]
  };
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
  cityWithDistricts("bucheon", "부천시", ["경기", "부천"], [
    r("bucheon-wonmi", "원미구", ["경기", "부천", "원미구"]),
    r("bucheon-sosa", "소사구", ["경기", "부천", "소사구"]),
    r("bucheon-ojeong", "오정구", ["경기", "부천", "오정구"])
  ]),
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
  cityOnly("pyeongtaek", "평택시", "경기", "평택"),
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
  },
  cityOnly("dongducheon", "동두천시", "경기", "동두천"),
  cityOnly("guri", "구리시", "경기", "구리"),
  cityOnly("gwacheon", "과천시", "경기", "과천"),
  cityOnly("uiwang", "의왕시", "경기", "의왕"),
  cityOnly("hanam", "하남시", "경기", "하남"),
  cityOnly("anseong", "안성시", "경기", "안성"),
  cityOnly("yeoju", "여주시", "경기", "여주"),
  cityOnly("yangju", "양주시", "경기", "양주"),
  cityOnly("pocheon", "포천시", "경기", "포천"),
  cityOnly("gapyeong", "가평군", "경기", "가평"),
  cityOnly("yeoncheon", "연천군", "경기", "연천"),
  cityOnly("yangpyeong", "양평군", "경기", "양평")
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

const GANGWON_CITIES: RegionCityDef[] = [
  cityOnly("chuncheon", "춘천시", "강원", "춘천"),
  cityOnly("wonju", "원주시", "강원", "원주"),
  cityOnly("gangneung", "강릉시", "강원", "강릉"),
  cityOnly("donghae", "동해시", "강원", "동해"),
  cityOnly("taebaek", "태백시", "강원", "태백"),
  cityOnly("sokcho", "속초시", "강원", "속초"),
  cityOnly("samcheok", "삼척시", "강원", "삼척"),
  cityOnly("hongcheon", "홍천군", "강원", "홍천"),
  cityOnly("hoengseong", "횡성군", "강원", "횡성"),
  cityOnly("yeongwol", "영월군", "강원", "영월"),
  cityOnly("pyeongchang", "평창군", "강원", "평창"),
  cityOnly("jeongseon", "정선군", "강원", "정선"),
  cityOnly("cheorwon", "철원군", "강원", "철원"),
  cityOnly("hwacheon", "화천군", "강원", "화천"),
  cityOnly("yanggu-gw", "양구군", "강원", "양구"),
  cityOnly("inje", "인제군", "강원", "인제"),
  cityOnly("goseong-gw", "고성군", "강원", "고성군"),
  cityOnly("yangyang", "양양군", "강원", "양양")
];

/** 공식 주소는 `충청북도` — `충북` 단독은 부분 문자열로 안 잡힘 */
const CHUNGBUK_CITIES: RegionCityDef[] = [
  cityWithDistricts("cheongju-cb", "청주시", ["충청북도", "청주"], [
    r("sangdang", "상당구", ["충청북도", "청주", "상당구"]),
    r("seowon", "서원구", ["충청북도", "청주", "서원구"]),
    r("heungdeok", "흥덕구", ["충청북도", "청주", "흥덕구"]),
    r("cheongwon", "청원구", ["충청북도", "청주", "청원구"])
  ]),
  cityOnly("chungju", "충주시", "충청북도", "충주"),
  cityOnly("jecheon", "제천시", "충청북도", "제천"),
  cityOnly("boeun", "보은군", "충청북도", "보은"),
  cityOnly("okcheon", "옥천군", "충청북도", "옥천"),
  cityOnly("yeongdong", "영동군", "충청북도", "영동"),
  cityOnly("jeungpyeong", "증평군", "충청북도", "증평"),
  cityOnly("jincheon", "진천군", "충청북도", "진천"),
  cityOnly("goesan", "괴산군", "충청북도", "괴산"),
  cityOnly("eumseong", "음성군", "충청북도", "음성"),
  cityOnly("danyang", "단양군", "충청북도", "단양")
];

const CHUNGNAM_CITIES: RegionCityDef[] = [
  cityWithDistricts("cheonan", "천안시", ["충남", "천안"], [
    r("dongnam-cn", "동남구", ["충남", "천안", "동남구"]),
    r("seobuk-cn", "서북구", ["충남", "천안", "서북구"])
  ]),
  cityOnly("gongju", "공주시", "충남", "공주"),
  cityOnly("boryeong", "보령시", "충남", "보령"),
  cityOnly("asan", "아산시", "충남", "아산"),
  cityOnly("seosan", "서산시", "충남", "서산"),
  cityOnly("nonsan", "논산시", "충남", "논산"),
  cityOnly("gyeryong", "계룡시", "충남", "계룡"),
  cityOnly("dangjin", "당진시", "충남", "당진"),
  cityOnly("geumsan", "금산군", "충남", "금산"),
  cityOnly("buyeo", "부여군", "충남", "부여"),
  cityOnly("seocheon", "서천군", "충남", "서천"),
  cityOnly("cheongyang", "청양군", "충남", "청양"),
  cityOnly("hongseong", "홍성군", "충남", "홍성"),
  cityOnly("yesan", "예산군", "충남", "예산"),
  cityOnly("taean", "태안군", "충남", "태안")
];

const GYEONGBUK_CITIES: RegionCityDef[] = [
  cityWithDistricts("pohang-gb", "포항시", ["경북", "포항"], [
    r("pohang-nam", "남구", ["경북", "포항", "남구"]),
    r("pohang-buk", "북구", ["경북", "포항", "북구"])
  ]),
  cityOnly("gyeongju", "경주시", "경북", "경주"),
  cityOnly("gimcheon", "김천시", "경북", "김천"),
  cityOnly("andong", "안동시", "경북", "안동"),
  cityWithDistricts("gumi", "구미시", ["경북", "구미"], [
    r("gumi-wonmi", "원미구", ["경북", "구미", "원미구"]),
    r("gumi-seonsan", "선산구", ["경북", "구미", "선산구"])
  ]),
  cityOnly("yeongju", "영주시", "경북", "영주"),
  cityOnly("yeongcheon", "영천시", "경북", "영천"),
  cityOnly("sangju", "상주시", "경북", "상주"),
  cityOnly("mungyeong", "문경시", "경북", "문경"),
  cityOnly("gyeongsan", "경산시", "경북", "경산"),
  cityOnly("gunwi", "군위군", "경북", "군위"),
  cityOnly("uiseong", "의성군", "경북", "의성"),
  cityOnly("cheongsong", "청송군", "경북", "청송"),
  cityOnly("yeongyang", "영양군", "경북", "영양"),
  cityOnly("yeongdeok", "영덕군", "경북", "영덕"),
  cityOnly("cheongdo", "청도군", "경북", "청도"),
  cityOnly("goryeong", "고령군", "경북", "고령"),
  cityOnly("seongju", "성주군", "경북", "성주"),
  cityOnly("chilgok", "칠곡군", "경북", "칠곡"),
  cityOnly("yecheon", "예천군", "경북", "예천"),
  cityOnly("bonghwa", "봉화군", "경북", "봉화"),
  cityOnly("uljin", "울진군", "경북", "울진"),
  cityOnly("ulleung", "울릉군", "경북", "울릉")
];

const GYEONGNAM_CITIES: RegionCityDef[] = [
  cityOnly("changwon", "창원시", "경남", "창원"),
  cityOnly("jinju", "진주시", "경남", "진주"),
  cityOnly("tongyeong", "통영시", "경남", "통영"),
  cityOnly("sacheon", "사천시", "경남", "사천"),
  cityOnly("gimhae", "김해시", "경남", "김해"),
  cityOnly("miryang", "밀양시", "경남", "밀양"),
  cityOnly("geoje", "거제시", "경남", "거제"),
  cityOnly("yangsan", "양산시", "경남", "양산"),
  cityOnly("uiryeong", "의령군", "경남", "의령"),
  cityOnly("haman", "함안군", "경남", "함안"),
  cityOnly("changnyeong", "창녕군", "경남", "창녕"),
  cityOnly("goseong-gn", "고성군", "경남", "고성군"),
  cityOnly("namhae", "남해군", "경남", "남해"),
  cityOnly("hadong", "하동군", "경남", "하동"),
  cityOnly("sancheong", "산청군", "경남", "산청"),
  cityOnly("hamyang", "함양군", "경남", "함양"),
  cityOnly("geochang", "거창군", "경남", "거창"),
  cityOnly("hapcheon", "합천군", "경남", "합천")
];

const JEONBUK_CITIES: RegionCityDef[] = [
  cityWithDistricts("jeonju", "전주시", ["전북", "전주"], [
    r("wansan", "완산구", ["전북", "전주", "완산구"]),
    r("deokjin", "덕진구", ["전북", "전주", "덕진구"])
  ]),
  cityOnly("gunsan", "군산시", "전북", "군산"),
  cityOnly("iksan", "익산시", "전북", "익산"),
  cityOnly("jeongeup", "정읍시", "전북", "정읍"),
  cityOnly("namwon", "남원시", "전북", "남원"),
  cityOnly("gimje", "김제시", "전북", "김제"),
  cityOnly("wanju", "완주군", "전북", "완주"),
  cityOnly("jinan", "진안군", "전북", "진안"),
  cityOnly("muju", "무주군", "전북", "무주"),
  cityOnly("jangsu", "장수군", "전북", "장수"),
  cityOnly("imsil", "임실군", "전북", "임실"),
  cityOnly("sunchang", "순창군", "전북", "순창"),
  cityOnly("gochang", "고창군", "전북", "고창"),
  cityOnly("buan", "부안군", "전북", "부안")
];

const JEONNAM_CITIES: RegionCityDef[] = [
  cityOnly("mokpo", "목포시", "전남", "목포"),
  cityOnly("yeosu", "여수시", "전남", "여수"),
  cityOnly("suncheon", "순천시", "전남", "순천"),
  cityOnly("naju", "나주시", "전남", "나주"),
  cityOnly("gwangyang", "광양시", "전남", "광양"),
  cityOnly("damyang", "담양군", "전남", "담양"),
  cityOnly("gokseong", "곡성군", "전남", "곡성"),
  cityOnly("gurye", "구례군", "전남", "구례"),
  cityOnly("hwasun", "화순군", "전남", "화순"),
  cityOnly("boseong", "보성군", "전남", "보성"),
  cityOnly("jangheung", "장흥군", "전남", "장흥"),
  cityOnly("gangjin", "강진군", "전남", "강진"),
  cityOnly("haenam", "해남군", "전남", "해남"),
  cityOnly("yeongam", "영암군", "전남", "영암"),
  cityOnly("muan", "무안군", "전남", "무안"),
  cityOnly("hampyeong", "함평군", "전남", "함평"),
  cityOnly("yeonggwang", "영광군", "전남", "영광"),
  cityOnly("jangseong", "장성군", "전남", "장성"),
  cityOnly("wando", "완도군", "전남", "완도"),
  cityOnly("jindo", "진도군", "전남", "진도"),
  cityOnly("sinan", "신안군", "전남", "신안")
];

const JEJU_CITIES: RegionCityDef[] = [
  { slug: "jeju-si", nameKo: "제주시", cityOnlyNeedles: ["제주", "제주시"] },
  { slug: "seogwipo", nameKo: "서귀포시", cityOnlyNeedles: ["제주", "서귀포"] }
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
    cities: GANGWON_CITIES
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
    cities: CHUNGBUK_CITIES
  },
  {
    slug: "chungnam",
    shortNameKo: "충남",
    nameKo: "충청남도",
    cities: CHUNGNAM_CITIES
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
    cities: GYEONGBUK_CITIES
  },
  {
    slug: "gyeongnam",
    shortNameKo: "경남",
    nameKo: "경상남도",
    cities: GYEONGNAM_CITIES
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
    cities: JEONBUK_CITIES
  },
  {
    slug: "jeonnam",
    shortNameKo: "전남",
    nameKo: "전라남도",
    cities: JEONNAM_CITIES
  },
  {
    slug: "jeju",
    shortNameKo: "제주",
    nameKo: "제주특별자치도",
    cities: JEJU_CITIES
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
      if (segments.length === 2 && city.legacyCityWideNeedles?.length) {
        return {
          provinceSlug: p.slug,
          shortNameKo: p.shortNameKo,
          citySlug: city.slug,
          cityNameKo: city.nameKo,
          needles: city.legacyCityWideNeedles,
          headingLabelKo: `${p.shortNameKo} ${city.nameKo}`.trim()
        };
      }
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

/** `sessionStorage` — 리스트에서 브라우저 뒤로가기 시 picker 선택 복원 */
export const LAST_REGION_PATH_STORAGE_KEY = "vinyl:regionPickerLastPath";

/**
 * 지역 picker 로 돌아갈 때 선택 상태를 복원하는 href.
 * `encodeURIComponent(regionPath)` 를 쿼리에 직접 넣으면 `/` 가 경로로 잘리거나 이중 인코딩될 수 있음.
 */
export function regionPickerHref(regionPath: string): string {
  return `/regions?${new URLSearchParams({ initial: regionPath }).toString()}`;
}

/** `?initial=` 값 정규화 (이중 인코딩·잔여 `%` 대비) */
export function parseRegionPickerInitial(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s;
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
          if (c.legacyCityWideNeedles?.length) {
            paths.push(regionHrefFromSegments([p.slug, c.slug]));
          }
          for (const dist of c.districts) {
            paths.push(regionHrefFromSegments([p.slug, c.slug, dist.slug]));
          }
        }
      }
    }
  }
  return paths;
}

/**
 * `/api/stores?regionPath=` 인덱스용 — leaf별 pathKey·needles (enumerateRegionLeafPathnames와 동일 범위).
 * 런타임 1회 byRegionPath 맵 구축에 사용.
 */
export function enumerateRegionIndexEntries(): ReadonlyArray<{
  pathKey: string;
  needles: readonly string[];
}> {
  const out: { pathKey: string; needles: readonly string[] }[] = [];
  for (const p of PROVINCES_ORDERED) {
    if (p.directDistricts?.length) {
      for (const d of p.directDistricts) {
        const leaf = resolveRegionLeafFromSlugPath([p.slug, d.slug]);
        if (!leaf) continue;
        out.push({ pathKey: leafToRegionPath(leaf), needles: leaf.needles });
      }
    }
    if (p.cities?.length) {
      for (const c of p.cities) {
        const hasDistricts = Boolean(c.districts?.length);
        if (!hasDistricts && c.cityOnlyNeedles?.length) {
          const leaf = resolveRegionLeafFromSlugPath([p.slug, c.slug]);
          if (!leaf) continue;
          out.push({ pathKey: leafToRegionPath(leaf), needles: leaf.needles });
        }
        if (hasDistricts && c.districts) {
          if (c.legacyCityWideNeedles?.length) {
            const leaf = resolveRegionLeafFromSlugPath([p.slug, c.slug]);
            if (!leaf) continue;
            out.push({ pathKey: leafToRegionPath(leaf), needles: leaf.needles });
          }
          for (const dist of c.districts) {
            const leaf = resolveRegionLeafFromSlugPath([p.slug, c.slug, dist.slug]);
            if (!leaf) continue;
            out.push({ pathKey: leafToRegionPath(leaf), needles: leaf.needles });
          }
        }
      }
    }
  }
  return out;
}
