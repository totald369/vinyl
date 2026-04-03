#!/usr/bin/env node
/**
 * 제보 JSON을 public/data/reports_rows.json에 병합하고,
 * stores.sample.json에서 동일 위치(도로명+번지+근접 거리) 매장이 있으면 품목 플래그·인증 일부 갱신,
 * 없으면 주소 지오코딩 후 신규 행 추가.
 *
 * 실행 (frontend 디렉터리):
 *   node scripts/merge-reports-into-stores.mjs [제보.json 경로]
 *
 * 기본 입력: ~/Downloads/reports_rows.json
 * 필요: .env.local 의 KAKAO_REST_API_KEY (좌표가 없는 제보만 API 호출)
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STORES_PATH = path.join(ROOT, "public/data/stores.sample.json");
const REPORTS_OUT = path.join(ROOT, "public/data/reports_rows.json");
const CACHE_PATH = path.join(__dirname, "geocode-cache-reports-merge.json");

const DEFAULT_IN = path.join(os.homedir(), "Downloads/reports_rows.json");

function loadEnvLocal() {
  try {
    const p = path.join(ROOT, ".env.local");
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key === "KAKAO_REST_API_KEY" && !process.env.KAKAO_REST_API_KEY) {
        process.env.KAKAO_REST_API_KEY = val;
      }
    }
  } catch {
    /* no .env.local */
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** 예: "서울 마포구 마포대로 109" → "마포구마포대로109" */
function locationKeyFromRoad(road) {
  if (!road || typeof road !== "string") return "";
  const gu = road.match(/([가-힣]+구)\s+/);
  const rm = road.match(/([가-힣]+(?:대로|로|길))\s*(\d{1,5})(?:-\d+)?/);
  if (gu && rm) return `${gu[1]}${rm[1]}${rm[2]}`.replace(/\s/g, "");
  return road.replace(/\s/g, "").replace(/[(),]/g, "").toLowerCase();
}

function fullRoadForGeocode(road, detail) {
  let r = (road || "").trim();
  if (!r) return "";
  if (/^서울\s/.test(r) && !/특별시/.test(r)) r = r.replace(/^서울\s/, "서울특별시 ");
  if (/^부산\s/.test(r) && !/광역시/.test(r)) r = r.replace(/^부산\s/, "부산광역시 ");
  if (/^대구\s/.test(r) && !/광역시/.test(r)) r = r.replace(/^대구\s/, "대구광역시 ");
  if (/^인천\s/.test(r) && !/광역시/.test(r)) r = r.replace(/^인천\s/, "인천광역시 ");
  if (/^광주\s/.test(r) && !/광역시/.test(r)) r = r.replace(/^광주\s/, "광주광역시 ");
  if (/^대전\s/.test(r) && !/광역시/.test(r)) r = r.replace(/^대전\s/, "대전광역시 ");
  if (/^울산\s/.test(r) && !/광역시/.test(r)) r = r.replace(/^울산\s/, "울산광역시 ");
  const d = (detail || "").trim();
  return d ? `${r} ${d}` : r;
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(c) {
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(c, null, 0)}\n`, "utf8");
}

async function kakaoAddressCoords(query, restKey) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "1");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` }
  });
  if (!res.ok) return null;
  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) return null;
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function resolveCoordsForReport(row, restKey, cache) {
  const lat0 = Number(row.lat);
  const lng0 = Number(row.lng);
  if (Number.isFinite(lat0) && Number.isFinite(lng0)) {
    return { lat: lat0, lng: lng0 };
  }
  const q = fullRoadForGeocode(row.road_address, row.detail_address);
  if (!q) return null;
  if (cache[q]) {
    const { lat, lng } = cache[q];
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (!restKey) {
    console.error("좌표 없음 + KAKAO_REST_API_KEY 없음:", row.name, q);
    return null;
  }
  let c = await kakaoAddressCoords(q, restKey);
  if (!c && row.road_address) c = await kakaoAddressCoords(row.road_address.trim(), restKey);
  if (c) {
    cache[q] = c;
    return c;
  }
  return null;
}

const BRAND_KEYWORDS = [
  "롯데",
  "씨유",
  "CU",
  "GS25",
  "GS",
  "이마트",
  "세븐일레븐",
  "홈플러스",
  "코사마트",
  "농협",
  "하나로"
];

function nameAffinity(reportName, storeName) {
  const a = (reportName || "").replace(/\s/g, "");
  const b = (storeName || "").replace(/\s/g, "");
  if (!a || !b) return 0;
  let score = 0;
  if (b.includes(a.slice(0, Math.min(4, a.length)))) score += 3;
  const tokens = reportName.split(/[\s()·,/]+/).filter((t) => t.length >= 2);
  for (const t of tokens) {
    if (t.length >= 2 && b.includes(t.replace(/\s/g, ""))) score += 1;
  }
  const r = reportName || "";
  const s = storeName || "";
  for (const kw of BRAND_KEYWORDS) {
    if (r.includes(kw) && s.includes(kw)) score += 12;
  }
  return score;
}

function pickBestMatch(stores, reportKey, point, reportName) {
  if (!reportKey || !point) return null;
  const MAX_KM = 0.22;
  const candidates = [];
  for (const s of stores) {
    const sk = locationKeyFromRoad(s.roadAddress || "");
    if (sk !== reportKey) continue;
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const km = haversineKm(point, { lat, lng });
    if (km > MAX_KM) continue;
    candidates.push({ s, km, aff: nameAffinity(reportName, s.name) });
  }
  if (candidates.length === 0) return null;
  /** 동일 도로번지 후보가 여럿이면 상호·브랜드 유사도 우선, 그다음 거리 */
  candidates.sort((a, b) => {
    if (b.aff !== a.aff) return b.aff - a.aff;
    return a.km - b.km;
  });
  return candidates[0].s;
}

function mergeFlagsIntoStore(store, row, datePart) {
  store.hasTrashBag = !!(store.hasTrashBag || row.has_trash_bag);
  store.hasSpecialBag = !!(store.hasSpecialBag || row.has_special_bag);
  store.hasLargeWasteSticker = !!(store.hasLargeWasteSticker || row.has_large_waste_sticker);
  store.adminVerified = true;
  if (datePart && datePart > (store.dataReferenceDate || "")) {
    store.dataReferenceDate = datePart;
  }
}

function datePartFromCreated(created) {
  const t = (created || "").trim();
  return t.length >= 10 ? t.slice(0, 10) : undefined;
}

async function main() {
  loadEnvLocal();
  const restKey = process.env.KAKAO_REST_API_KEY ?? "";
  const inPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_IN;

  if (!fs.existsSync(inPath)) {
    console.error("입력 파일 없음:", inPath);
    process.exit(1);
  }
  if (!fs.existsSync(STORES_PATH)) {
    console.error("stores.sample.json 없음:", STORES_PATH);
    process.exit(1);
  }

  const incoming = JSON.parse(fs.readFileSync(inPath, "utf8"));
  if (!Array.isArray(incoming)) {
    console.error("제보 파일은 배열이어야 합니다.");
    process.exit(1);
  }

  let existingReports = [];
  try {
    existingReports = JSON.parse(fs.readFileSync(REPORTS_OUT, "utf8"));
  } catch {
    existingReports = [];
  }
  if (!Array.isArray(existingReports)) existingReports = [];

  const byId = new Map();
  for (const r of existingReports) {
    if (r && r.id) byId.set(String(r.id), r);
  }
  for (const r of incoming) {
    if (r && r.id) byId.set(String(r.id), r);
  }
  const mergedReports = Array.from(byId.values());
  mergedReports.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  const stores = JSON.parse(fs.readFileSync(STORES_PATH, "utf8"));
  if (!Array.isArray(stores)) {
    console.error("stores.sample.json 형식 오류");
    process.exit(1);
  }

  const cache = loadCache();
  let updated = 0;
  let added = 0;
  let skipped = 0;

  for (const row of incoming) {
    if (!row || !row.id) continue;
    const st = (row.status || "").toLowerCase();
    if (st === "rejected") continue;

    const datePart = datePartFromCreated(row.created_at);

    const sid = row.store_id != null && String(row.store_id).trim() !== "" ? String(row.store_id).trim() : null;

    if (sid) {
      const store = stores.find((s) => String(s.id) === sid);
      if (store) {
        mergeFlagsIntoStore(store, row, datePart);
        updated++;
        console.error(`[id매칭] ${sid} ${store.name} ← 제보 ${row.id}`);
      } else {
        console.error(`[경고] store_id=${sid} 매장 없음, 제보 ${row.id}`);
        skipped++;
      }
      continue;
    }

    const coords = await resolveCoordsForReport(row, restKey, cache);
    if (!coords) {
      console.error(`[스킵] 좌표 실패: ${row.name}`);
      skipped++;
      continue;
    }

    row.lat = coords.lat;
    row.lng = coords.lng;

    const rKey = locationKeyFromRoad(row.road_address || "");
    const match = pickBestMatch(stores, rKey, coords, row.name || "");

    if (match) {
      mergeFlagsIntoStore(match, row, datePart);
      updated++;
      console.error(`[주소매칭] ${match.id} ${match.name} ← 제보 ${row.name} (${row.id})`);
    } else {
      const road = fullRoadForGeocode(row.road_address, "").replace(/^서울특별시\s/, "서울특별시 ");
      const detail = (row.detail_address || "").trim();
      const newRow = {
        id: `report:${row.id}`,
        name: (row.name || "").trim() || "이름미상",
        lat: coords.lat,
        lng: coords.lng,
        roadAddress: (row.road_address || "").trim() || road,
        address: detail || (row.road_address || "").trim(),
        businessStatus: "영업",
        hasTrashBag: row.has_trash_bag === true,
        hasSpecialBag: row.has_special_bag === true,
        hasLargeWasteSticker: row.has_large_waste_sticker === true,
        adminVerified: true,
        dataReferenceDate: datePart || "2026-04-02"
      };
      stores.push(newRow);
      added++;
      console.error(`[신규] report:${row.id} ${newRow.name}`);
    }

    await new Promise((r) => setTimeout(r, 40));
  }

  saveCache(cache);
  fs.writeFileSync(REPORTS_OUT, `${JSON.stringify(mergedReports, null, 2)}\n`, "utf8");
  fs.writeFileSync(STORES_PATH, `${JSON.stringify(stores, null, 2)}\n`, "utf8");

  console.error(
    `완료: 기존 매장 갱신 ${updated}건, 신규 추가 ${added}건, 스킵/경고 ${skipped}건 → ${REPORTS_OUT}, ${STORES_PATH}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
