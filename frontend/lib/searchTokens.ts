/**
 * 검색 토큰 파싱·매칭(한글 자판 변환 없음).
 * `es-hangul` 은 `@/lib/searchTokensHangul` — 지역 목록 등 필요 시에만 dynamic import.
 */

export function parseSearchTokens(raw: string): string[] {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 모든 토큰이 하나의 문자열(이미 소문자 권장)에 부분 문자열로 포함되는지 여부(AND).
 * 한글 자판 폴백은 `hangulTokens`(precomputeHangulTokens)로만 적용.
 */
export function textMatchesAllTokens(
  textLower: string,
  tokens: string[],
  hangulTokens?: (string | null)[]
): boolean {
  if (tokens.length === 0) return false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (textLower.includes(t)) continue;
    const hangul = hangulTokens?.[i];
    if (hangul != null && textLower.includes(hangul)) continue;
    return false;
  }
  return true;
}
