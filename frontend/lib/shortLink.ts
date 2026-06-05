import { appendStoreShareUtm } from "@/lib/shareUtm";
import { SITE_URL } from "@/lib/site";

/** 6 chars: A–Z a–z 0–9 (URL-safe, unreserved) */
export const SHORT_CODE_REGEX = /^[a-zA-Z0-9]{6}$/;

/** Set before navigating home so `?s=` can be restored if the query is dropped (some desktop clients). */
export const DEEPLINK_SHORT_STORAGE_KEY = "trashbagmap_deeplink_s";

const SHORT_CODE_LENGTH = 6;
const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export type WithOptionalShortCode = { shortCode?: string };

export function isValidShortCode(value: string | undefined | null): value is string {
  return typeof value === "string" && SHORT_CODE_REGEX.test(value);
}

/** Unpredictable short code using crypto RNG */
export function generateShortCode(): string {
  const bytes = new Uint8Array(SHORT_CODE_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto") as typeof import("crypto");
    const buf = nodeCrypto.randomBytes(SHORT_CODE_LENGTH);
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) bytes[i] = buf[i]!;
  }
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += CHARSET[bytes[i]! % CHARSET.length]!;
  }
  return out;
}

/**
 * 제보 등 JSON에 shortCode가 없는 행용: 시드만 같으면 항상 동일한 6자 코드(공공데이터와 충돌 확률은 무시 가능 수준).
 */
export function stableShortCodeFromSeed(seed: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = "";
  let x = h >>> 0;
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += CHARSET[x % CHARSET.length]!;
    x = (Math.imul(x, 1597334677) + i + 1) >>> 0;
  }
  return out;
}

/**
 * Runtime must not generate new shortCode.
 * Missing/invalid/duplicate codes should be fixed by `npm run shortcodes:assign`.
 */
export function ensureShortCodesOnStores<T extends WithOptionalShortCode>(
  stores: T[]
): T[] {
  const counts = new Map<string, number>();
  let missingOrInvalid = 0;
  for (const s of stores) {
    const c = s.shortCode?.trim();
    if (isValidShortCode(c)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    } else {
      missingOrInvalid++;
    }
  }
  const duplicates = [...counts.values()].filter((v) => v > 1).length;

  if (missingOrInvalid > 0 || duplicates > 0) {
    console.warn(
      `ensureShortCodesOnStores: missing/invalid=${missingOrInvalid}, duplicate=${duplicates}. ` +
        `No runtime shortCode generation is performed. Run: npm run shortcodes:assign`
    );
  }

  return stores;
}

export function getStoreByShortCode<T extends WithOptionalShortCode>(
  stores: T[],
  shortCode: string
): T | undefined {
  const key = shortCode.trim();
  if (!isValidShortCode(key)) return undefined;
  return stores.find((s) => s.shortCode === key);
}

/** Public share URL (uses SITE_URL; same on server and client bundle). UTM은 중복 없이 1회만 추가. */
export function getShortShareUrl(store: WithOptionalShortCode): string {
  const base = SITE_URL.replace(/\/$/, "");
  if (!isValidShortCode(store.shortCode)) {
    return `${base}/`;
  }
  const path = `${base}/s/${store.shortCode}`;
  return appendStoreShareUtm(path, store.shortCode!);
}

export { getStoreDetailAddress, getStoreMetadata } from "@/lib/storeMetadata";
