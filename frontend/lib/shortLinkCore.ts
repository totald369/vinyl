/** 6 chars: A–Z a–z 0–9 (URL-safe, unreserved) */
export const SHORT_CODE_REGEX = /^[a-zA-Z0-9]{6}$/;

/** Set before navigating home so `?s=` can be restored if the query is dropped (some desktop clients). */
export const DEEPLINK_SHORT_STORAGE_KEY = "trashbagmap_deeplink_s";

export type WithOptionalShortCode = { shortCode?: string };

export function isValidShortCode(value: string | undefined | null): value is string {
  return typeof value === "string" && SHORT_CODE_REGEX.test(value);
}
