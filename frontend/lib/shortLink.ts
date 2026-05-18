import { SITE_URL } from "@/lib/site";
import { isValidShortCode, type WithOptionalShortCode } from "@/lib/shortLinkCore";

export {
  DEEPLINK_SHORT_STORAGE_KEY,
  isValidShortCode,
  SHORT_CODE_REGEX,
  type WithOptionalShortCode
} from "@/lib/shortLinkCore";

const SHORT_CODE_LENGTH = 6;
const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Unpredictable short code using Web Crypto (browser + modern Node). */
export function generateShortCode(): string {
  const bytes = new Uint8Array(SHORT_CODE_LENGTH);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("generateShortCode requires Web Crypto getRandomValues");
  }
  cryptoObj.getRandomValues(bytes);
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
export function ensureShortCodesOnStores<T extends WithOptionalShortCode>(stores: T[]): T[] {
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

/** Public share URL (uses SITE_URL; same on server and client bundle). */
export function getShortShareUrl(store: WithOptionalShortCode): string {
  const base = SITE_URL.replace(/\/$/, "");
  if (!isValidShortCode(store.shortCode)) {
    return `${base}/`;
  }
  return `${base}/s/${store.shortCode}`;
}

export { getStoreDetailAddress, getStoreMetadata } from "@/lib/storeMetadata";
