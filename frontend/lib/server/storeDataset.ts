import fs from "fs";
import path from "path";

import type { RawStoreRow } from "@/lib/storeData";
import { mergeStoreSources } from "@/lib/storeData";
import type { RawReportRow } from "@/lib/reportStores";

const DATA_DIR = path.join(process.cwd(), "public", "data");

function readJsonArray<T>(file: string): T[] {
  const full = path.join(DATA_DIR, file);
  try {
    const raw = fs.readFileSync(full, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

let cached: ReturnType<typeof mergeStoreSources> | null = null;

/** 서버 전용: 병합된 전체 매장(캐시). API에서 필터링만 수행합니다. */
export function getMergedStores() {
  if (cached) return cached;

  const mainRows = readJsonArray<RawStoreRow>("stores.sample.json");
  const gunpoRows = readJsonArray<RawStoreRow>("stores.gunpo.json");
  const goyangRows = readJsonArray<RawStoreRow>("stores.goyang.json");
  const goyangStickerRows = readJsonArray<RawStoreRow>("stores.goyang-sticker.json");
  const reportRows = readJsonArray<RawReportRow>("reports_rows.json");

  cached = mergeStoreSources(
    mainRows,
    gunpoRows,
    goyangRows,
    goyangStickerRows,
    reportRows
  );
  return cached;
}
