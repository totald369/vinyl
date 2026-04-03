/**
 * 검색어를 공백 기준 토큰으로 나눕니다(앞뒤 공백·연속 공백 정리, 소문자).
 */
export function parseSearchTokens(raw: string): string[] {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 모든 토큰이 하나의 문자열(이미 소문자 권장)에 부분 문자열로 포함되는지 여부(AND).
 */
export function textMatchesAllTokens(textLower: string, tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((t) => textLower.includes(t));
}
