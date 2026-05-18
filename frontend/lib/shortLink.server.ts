import { randomBytes } from "crypto";

const SHORT_CODE_LENGTH = 6;
const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Server/scripts only — unpredictable short code using Node crypto RNG */
export function generateShortCode(): string {
  const buf = randomBytes(SHORT_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += CHARSET[buf[i]! % CHARSET.length]!;
  }
  return out;
}
