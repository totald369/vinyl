/**
 * 빌드 타임 매장 데이터 병합 캐시 생성기.
 *
 * 변경 전: 서버리스 cold start 마다 38개 JSON(45MB) 동기 로드 + 99k normalize +
 *          dedupeStoresByBizNameProximity 의 브랜드별 O(n²) haversine — 매번 재실행.
 * 변경 후: 빌드 시점에 1회 계산해 `public/data/_merged_cache.json` 으로 직렬화.
 *          런타임은 단일 파일 1회 read + JSON.parse 만 수행 → cold start 응답 시간 단축.
 * 측정: 첫 요청 TTFB(서버 cold), Vercel function init 시간, 메모리 사용량.
 *
 * 실행: `tsx scripts/build-merged-cache.ts` (build 스크립트에 prepended).
 */
import fs from "fs";
import path from "path";

import { buildRegionSeoSummaryFile } from "../lib/buildRegionSeoSummaries";
import type { RawStoreRow } from "../lib/storeData";
import { mergeStoreSources } from "../lib/storeData";
import { REGION_SEO_SUMMARY_FILE } from "../lib/regionSeoSummary";
import { STORE_DATA_JSON_FILES } from "../lib/storeDataSourceFiles";
import type { RawReportRow } from "../lib/reportStores";
import { syncReportActivitiesFromRows } from "../lib/activityFeedWriter";

const DATA_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(DATA_DIR, "_merged_cache.json");
const REGION_SUMMARY_FILE = path.join(DATA_DIR, REGION_SEO_SUMMARY_FILE);

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

function main() {
  const startedAt = Date.now();

  const reportRows = readJsonArray<RawReportRow>("reports_rows.json");
  const storeSources = STORE_DATA_JSON_FILES.map((file) =>
    readJsonArray<RawStoreRow>(file)
  );
  const merged = mergeStoreSources(reportRows, ...storeSources);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(merged), "utf8");

  const regionSummaries = buildRegionSeoSummaryFile(merged);
  fs.writeFileSync(REGION_SUMMARY_FILE, JSON.stringify(regionSummaries), "utf8");

  syncReportActivitiesFromRows(reportRows);

  const stat = fs.statSync(OUT_FILE);
  const summaryStat = fs.statSync(REGION_SUMMARY_FILE);
  const elapsedMs = Date.now() - startedAt;
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  const summaryKb = (summaryStat.size / 1024).toFixed(1);
  console.log(
    `[build-merged-cache] wrote ${OUT_FILE} (${merged.length} stores, ${sizeMb} MB) and ${REGION_SUMMARY_FILE} (${summaryKb} KB) in ${elapsedMs} ms`
  );
}

main();
