import { convertQwertyToHangul } from "es-hangul";

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

export function precomputeHangulTokens(tokens: string[]): (string | null)[] {
  const out: (string | null)[] = new Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    out[i] = qwertyTokenToHangul(tokens[i]);
  }
  return out;
}
