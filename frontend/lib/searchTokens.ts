import { convertQwertyToHangul } from "es-hangul";

/**
 * 검색어를 공백 기준 토큰으로 나눕니다(앞뒤 공백·연속 공백 정리, 소문자).
 */
export function parseSearchTokens(raw: string): string[] {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** 영문 자판으로 한글을 친 것처럼 보이는 토큰(a-z만)을 한글로 변환(실패 시 null). */
export function qwertyTokenToHangul(tokenLower: string): string | null {
  if (tokenLower.length < 2 || !/^[a-z]+$/.test(tokenLower)) {
    return null;
  }
  try {
    const h = convertQwertyToHangul(tokenLower);
    return h.length > 0 ? h.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * 모든 토큰이 하나의 문자열(이미 소문자 권장)에 부분 문자열로 포함되는지 여부(AND).
 * 토큰이 영문(a-z)만이면, 같은 타자를 한글 두벌식 자판으로 쳤을 때의 문자열로도 매칭합니다.
 * (예: rhksdkr → 관악, 관악구 주소 검색 가능)
 */
export function textMatchesAllTokens(textLower: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  return tokens.every((t) => {
    if (textLower.includes(t)) return true;
    const hangul = qwertyTokenToHangul(t);
    return hangul != null && textLower.includes(hangul);
  });
}
