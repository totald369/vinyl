#!/usr/bin/env node
/**
 * Assigns unique 6-char shortCode to rows in public/data store JSON files.
 * Keep charset / length in sync with frontend/lib/shortLink.ts.
 *
 * Usage: node scripts/assign-store-short-codes.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash, randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "public", "data");

const FILES = [
  "stores.sample.json",
  "stores.gunpo.json",
  "stores.goyang.json",
  "stores.goyang-sticker.json"
];

const SHORT_CODE_REGEX = /^[a-zA-Z0-9]{6}$/;
const SHORT_CODE_LENGTH = 6;
const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function isValidShortCode(value) {
  return typeof value === "string" && SHORT_CODE_REGEX.test(value);
}

function generateShortCode() {
  const buf = randomBytes(SHORT_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += CHARSET[buf[i] % CHARSET.length];
  }
  return out;
}

function ensureShortCodesOnStores(stores) {
  const counts = new Map();
  for (const s of stores) {
    const c = typeof s.shortCode === "string" ? s.shortCode.trim() : "";
    if (isValidShortCode(c)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }

  const used = new Set();
  for (const s of stores) {
    const c = typeof s.shortCode === "string" ? s.shortCode.trim() : "";
    if (isValidShortCode(c) && counts.get(c) === 1) {
      used.add(c);
    }
  }

  return stores.map((s) => {
    const c = typeof s.shortCode === "string" ? s.shortCode.trim() : "";
    if (isValidShortCode(c) && counts.get(c) === 1) {
      return { ...s, shortCode: c };
    }
    let next;
    let guard = 0;
    do {
      next = generateShortCode();
      guard++;
      if (guard > 10_000) {
        throw new Error("ensureShortCodesOnStores: could not allocate unique shortCode");
      }
    } while (used.has(next));
    used.add(next);
    return { ...s, shortCode: next };
  });
}

function main() {
  /** @type {{ name: string; full: string; rows: object[]; dirty?: boolean }[]} */
  const loaded = [];

  for (const name of FILES) {
    const full = path.join(DATA_DIR, name);
    if (!fs.existsSync(full)) {
      console.warn(`skip (missing): ${name}`);
      continue;
    }
    const parsed = JSON.parse(fs.readFileSync(full, "utf8"));
    if (!Array.isArray(parsed)) {
      console.warn(`skip (not array): ${name}`);
      continue;
    }
    loaded.push({ name, full, rows: parsed });
  }

  const flat = [];
  for (const file of loaded) {
    file.rows.forEach((row, index) => {
      if (row && typeof row === "object") flat.push({ file, index });
    });
  }

  if (!flat.length) {
    console.log("no rows to process");
    return;
  }

  const mergedForCodes = flat.map(({ file, index }) => ({ ...file.rows[index] }));
  const withCodes = ensureShortCodesOnStores(mergedForCodes);

  for (let i = 0; i < flat.length; i++) {
    const { file, index } = flat[i];
    const nextCode = withCodes[i].shortCode;
    const prev = file.rows[index].shortCode;
    if (prev !== nextCode) {
      file.rows[index] = { ...file.rows[index], shortCode: nextCode };
      file.dirty = true;
    }
  }

  let any = false;
  for (const file of loaded) {
    if (!file.dirty) continue;
    any = true;
    const nextJson = `${JSON.stringify(file.rows, null, 2)}\n`;
    const prevHash = createHash("sha256").update(fs.readFileSync(file.full, "utf8")).digest("hex");
    fs.writeFileSync(file.full, nextJson, "utf8");
    const newHash = createHash("sha256").update(nextJson).digest("hex");
    console.log(`updated ${file.name} (${prevHash.slice(0, 8)} → ${newHash.slice(0, 8)})`);
  }

  if (!any) {
    console.log("all shortCodes already valid and unique; no file writes");
  }
}

main();
