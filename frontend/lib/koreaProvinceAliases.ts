/**
 * 행정구역 이름 별칭(충남 등) 처리 — 검색 인덱스·필터·주소 표시.
 *
 * - 검색/필터: 본명·약칭을 같은 blob에 넣어 `충청남도` 검색 시 `충남 …` 매장과 연결됩니다.
 * - 표시: 주소 줄에 단독 도 약칭이 있으면 본명으로 바꿉니다(허브 주소 문자열 형식).
 */

const PAIRS = [
  ["충청남도", "충남"],
  ["충청북도", "충북"],
  ["경상남도", "경남"],
  ["경상북도", "경북"],
  ["전라북도", "전북"],
  ["전라남도", "전남"]
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 약칭이 행정 주소처럼 쓰인 경우만(예: 이름·동명 속 부분 문자열 제외 완화) */
export function abbreviatedProvinceOccursAsWord(textLower: string, abbreviationLower: string): boolean {
  const re = new RegExp(`(^|[\\s,.(;])${escapeRegExp(abbreviationLower)}(?=[\\s,.)]|$)`);
  return re.test(textLower);
}

/** 소문자·공백 정리 후 본명/약칭 별명을 같은 문자열 한 덩어리로 붙입니다. */
export function expandProvinceAliasesForSearch(lowerText: string): string {
  const t = lowerText.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const variants = new Set<string>([t]);
  for (const [full, abbr] of PAIRS) {
    const fl = full.toLowerCase();
    const al = abbr.toLowerCase();
    if (t.includes(fl)) variants.add(al);
    if (abbreviatedProvinceOccursAsWord(t, al)) variants.add(fl);
  }
  return [...variants].join(" ");
}

/**
 * 주소·목록 한 줄 표시용: `충남 공주시` → `충청남도 공주시`
 * (상호명 전체 문자열에 붙이지 말 것 — road/address 전용)
 */
export function normalizeProvinceAbbrevForDisplay(text: string): string {
  let s = text;
  for (const [full, abbr] of PAIRS) {
    const re = new RegExp(`(^|[\\s,.(;])${escapeRegExp(abbr)}(?=[\\s,.)]|$)`, "g");
    s = s.replace(re, `$1${full}`);
  }
  return s;
}
