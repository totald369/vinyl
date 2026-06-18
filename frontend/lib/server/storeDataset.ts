import "server-only";

import fs from "fs";
import path from "path";

import type { RawStoreRow, StoreData } from "@/lib/storeData";
import { mergeStoreSources } from "@/lib/storeData";
import { STORE_DATA_JSON_FILES } from "@/lib/storeDataSourceFiles";
import type { RawReportRow } from "@/lib/reportStores";

const DATA_DIR = path.join(process.cwd(), "public", "data");
const MERGED_CACHE_FILE = path.join(DATA_DIR, "_merged_cache.json");

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

/**
 * 서버 전용: 병합된 전체 매장(캐시). API에서 필터링만 수행합니다.
 *
 * 변경 전: cold start 마다 38개 JSON(45MB) 동기 read + normalize + dedupe(O(n²) per brand) →
 *          서버리스 인스턴스 init 1~수초 소요.
 * 변경 후: 빌드 타임에 `scripts/build-merged-cache.ts` 가 생성한 단일
 *          `public/data/_merged_cache.json` 만 read → init 시간 대폭 단축.
 *          캐시 파일이 없으면(개발/스크립트 환경) 기존 다중 파일 병합으로 폴백.
 * 측정: 첫 요청 TTFB(서버 cold), Vercel function init 시간.
 *
 * 성능: 대용량 `stores.json` 등은 클라이언트 번들에 포함하지 않고, 이 모듈·`getMergedStores`만
 * 서버(또는 Node 빌드 스크립트)에서 fs 경로로 로드합니다.
 */
export function getMergedStores() {
  if (cached) return cached;

  try {
    const raw = fs.readFileSync(MERGED_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      cached = parsed as StoreData[];
      return cached;
    }
  } catch {
    /* 캐시 미존재 → 폴백 */
  }
  return mergeFromSourcesFallback();
}

function mergeFromSourcesFallback(): StoreData[] {
  if (cached) return cached;

  const reportRows = readJsonArray<RawReportRow>("reports_rows.json");
  const storeSources = STORE_DATA_JSON_FILES.map((file) =>
    readJsonArray<RawStoreRow>(file)
  );

  cached = mergeStoreSources(reportRows, ...storeSources);
  return cached as StoreData[];
}
