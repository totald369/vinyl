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

import type { RawStoreRow } from "../lib/storeData";
import { mergeStoreSources } from "../lib/storeData";
import type { RawReportRow } from "../lib/reportStores";

const DATA_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(DATA_DIR, "_merged_cache.json");

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

  const merged = mergeStoreSources(
    readJsonArray<RawStoreRow>("stores.sample.json"),
    readJsonArray<RawStoreRow>("stores.gunpo.json"),
    readJsonArray<RawStoreRow>("stores.goyang.json"),
    readJsonArray<RawStoreRow>("stores.goyang-sticker.json"),
    readJsonArray<RawReportRow>("reports_rows.json"),
    readJsonArray<RawStoreRow>("stores.guro-noncombust.json"),
    readJsonArray<RawStoreRow>("stores.gwanak-noncombust.json"),
    readJsonArray<RawStoreRow>("stores.dobong-noncombust.json"),
    readJsonArray<RawStoreRow>("stores.bucheon-gbms.json"),
    readJsonArray<RawStoreRow>("stores.busan-namgu-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-junggu-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-junggu-pp.json"),
    readJsonArray<RawStoreRow>("stores.busan-donggu-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-dongnae-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-geumjeong-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-geumjeong-special.json"),
    readJsonArray<RawStoreRow>("stores.busan-bukgu-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-bukgu-special.json"),
    readJsonArray<RawStoreRow>("stores.busan-sasang-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-sasang-special.json"),
    readJsonArray<RawStoreRow>("stores.busan-haeundae-trash.json"),
    readJsonArray<RawStoreRow>("stores.busan-yeongdo-trash.json"),
    readJsonArray<RawStoreRow>("stores.gyeonggi-gwangju-findstore.json"),
    readJsonArray<RawStoreRow>("stores.gwangju-trash-lifeinsights.json"),
    readJsonArray<RawStoreRow>("stores.daegu-buk-dalseo-trash.json"),
    readJsonArray<RawStoreRow>("stores.incheon-michuhol-trash.json"),
    readJsonArray<RawStoreRow>("stores.incheon-yeonsu-trash-sticker.json"),
    readJsonArray<RawStoreRow>("stores.incheon-namdong-trash.json"),
    readJsonArray<RawStoreRow>("stores.incheon-bupyeong-trash-sticker-special.json"),
    readJsonArray<RawStoreRow>("stores.incheon-gyeyang-gbms.json"),
    readJsonArray<RawStoreRow>("stores.gyeonggi-siheung-trash.json"),
    readJsonArray<RawStoreRow>("stores.daejeon-donggu-trash.json"),
    readJsonArray<RawStoreRow>("stores.daejeon-yuseong-trash.json"),
    readJsonArray<RawStoreRow>("stores.daejeon-daedeok-trash.json"),
    readJsonArray<RawStoreRow>("stores.gangwon-wonju-trash.json"),
    readJsonArray<RawStoreRow>("stores.gangwon-taebaek-trash.json"),
    readJsonArray<RawStoreRow>("stores.ulsan-donggu-trash.json"),
    readJsonArray<RawStoreRow>("stores.ulsan-bukgu-trash.json"),
    readJsonArray<RawStoreRow>("stores.ulsan-bukgu-special.json"),
    readJsonArray<RawStoreRow>("stores.chungbuk-chungju-trash.json"),
    readJsonArray<RawStoreRow>("stores.chungbuk-cheongju-trash.json")
  );

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(merged), "utf8");

  const stat = fs.statSync(OUT_FILE);
  const elapsedMs = Date.now() - startedAt;
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(
    `[build-merged-cache] wrote ${OUT_FILE} (${merged.length} stores, ${sizeMb} MB) in ${elapsedMs} ms`
  );
}

main();
