import { convertQwertyToHangul } from "es-hangul";

/**
 * 검색어를 공백 기준 토큰으로 나눕니다(앞뒤 공백·연속 공백 정리, 소문자).
 */
export function parseSearchTokens(raw: string): string[] {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 토큰별 한글 변환 결과 메모이제이션.
 *
 * 변경 전: `textMatchesAllTokens` 가 매 매장(99k) × 매 토큰마다 `convertQwertyToHangul`을
 *          재호출 — 검색 한 번에 수만~수십만 회 변환.
 * 변경 후: 토큰 문자열 → 한글(or null) Map LRU 캐시. 동일 토큰은 1회만 변환.
 * 측정: /api/stores?q=... p95 응답 시간(서버 CPU 시간), `textMatchesAllTokens` self time.
 */
const QWERTY_HANGUL_CACHE_MAX = 1024;
const qwertyHangulCache = new Map<string, string | null>();

/** 영문 자판으로 한글을 친 것처럼 보이는 토큰(a-z만)을 한글로 변환(실패 시 null). */
export function qwertyTokenToHangul(tokenLower: string): string | null {
  if (tokenLower.length < 2 || !/^[a-z]+$/.test(tokenLower)) {
    return null;
  }
  const cached = qwertyHangulCache.get(tokenLower);
  if (cached !== undefined) return cached;
  let result: string | null = null;
  try {
    const h = convertQwertyToHangul(tokenLower);
    result = h.length > 0 ? h.toLowerCase() : null;
  } catch {
    result = null;
  }
  if (qwertyHangulCache.size >= QWERTY_HANGUL_CACHE_MAX) {
    const first = qwertyHangulCache.keys().next().value as string | undefined;
    if (first !== undefined) qwertyHangulCache.delete(first);
  }
  qwertyHangulCache.set(tokenLower, result);
  return result;
}

/**
 * 토큰들의 한글 변환을 1회 미리 계산해 비교 시 hot path 에서 재호출하지 않도록 합니다.
 * 검색 한 번에서 같은 토큰 배열을 반복 사용하는 호출자 전용.
 */
export function precomputeHangulTokens(tokens: string[]): (string | null)[] {
  const out: (string | null)[] = new Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    out[i] = qwertyTokenToHangul(tokens[i]);
  }
  return out;
}

/**
 * 모든 토큰이 하나의 문자열(이미 소문자 권장)에 부분 문자열로 포함되는지 여부(AND).
 * 토큰이 영문(a-z)만이면, 같은 타자를 한글 두벌식 자판으로 쳤을 때의 문자열로도 매칭합니다.
 * (예: rhksdkr → 관악, 관악구 주소 검색 가능)
 *
 * 두 번째 인자에 `precomputeHangulTokens(tokens)` 결과를 넘기면 hot loop 에서 변환 비용을 0 으로.
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
    const hangul = hangulTokens ? hangulTokens[i] : qwertyTokenToHangul(t);
    if (hangul != null && textLower.includes(hangul)) continue;
    return false;
  }
  return true;
}
