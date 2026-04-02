#!/usr/bin/env node
/**
 * 군포시청 종량제봉투 판매소 게시판(37페이지) 수집 → 카카오 주소 검색으로 좌표 보강
 * https://www.gunpo.go.kr/www/selectBbsNttList.do?bbsNo=2421&key=4521
 *
 * 실행 (frontend 디렉터리):
 *   node scripts/fetch-gunpo-trash-stores.mjs
 *
 * 필요: .env.local 의 KAKAO_REST_API_KEY
 * 결과: public/data/stores.gunpo.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public/data/stores.gunpo.json");
const CACHE = path.join(__dirname, "geocode-cache-gunpo.json");

const BASE =
  "https://www.gunpo.go.kr/www/selectBbsNttList.do?key=4521&bbsNo=2421&searchCtgry=&pageUnit=10&searchCnd=all&searchKrwd=&integrDeptCode=";

const DATA_REF = "2026-03-28";
const TOTAL_PAGES = 37;

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

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRowsFromPage(html) {
  const h3 = html.indexOf("<h3>종량제봉투 판매소</h3>");
  if (h3 < 0) return [];
  const tbodyStart = html.indexOf('<tbody class="text_center">', h3);
  if (tbodyStart < 0) return [];
  const tbodyEnd = html.indexOf("</tbody>", tbodyStart);
  const chunk = html.slice(tbodyStart, tbodyEnd);
  const rows = [];
  const trParts = chunk.split("<tr>");
  for (const part of trParts) {
    if (!part.includes("p-subject")) continue;
    const ntt = part.match(/nttNo=(\d+)/);
    if (!ntt) continue;
    const tds = [...part.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 4) continue;
    const listNo = stripTags(tds[0]);
    const dong = stripTags(tds[1]);
    const nameRaw = tds[2];
    const name = stripTags(nameRaw).replace(/\s*핫이슈\s*$/u, "").trim();
    const roadAddress = stripTags(tds[3]);
    if (!name || !roadAddress) continue;
    rows.push({
      nttNo: ntt[1],
      listNo,
      dong,
      name,
      roadAddress
    });
  }
  return rows;
}

async function fetchPage(pageIndex) {
  const url = `${BASE}&pageIndex=${pageIndex}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; trashbagmap-data/1.0; +https://www.trashbagmap.com)",
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`페이지 ${pageIndex} HTTP ${res.status}`);
  return res.text();
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE, `${JSON.stringify(cache, null, 0)}\n`, "utf8");
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

async function kakaoKeywordCoords(query, restKey) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
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

function geocodeQueryVariants(roadAddress) {
  const full = roadAddress.trim();
  if (full.includes("영업소재지") || full.length < 10) return [];
  const paren = full.indexOf("(");
  const beforeParen = paren > 0 ? full.slice(0, paren).trim() : full;
  const noFloorKorean = beforeParen.replace(/,\s*\d+층.*$/u, "").trim();
  const firstSeg = beforeParen.split(",")[0]?.trim() ?? beforeParen;
  const noMultiUnit = beforeParen
    .replace(/,\s*\d+,\s*\d+.*$/u, "")
    .replace(/,\s*\d+~\d+호.*$/u, "")
    .replace(/,\s*\d+호.*$/u, "")
    .trim();
  const noFloor = beforeParen.replace(/,\s*\d+~\d+호/g, "").replace(/,\s*\d+호/g, "").trim();
  const variants = [full, beforeParen, noFloorKorean, firstSeg, noMultiUnit, noFloor].filter(
    (q, i, a) => q.length >= 8 && a.indexOf(q) === i
  );
  return variants;
}

/** 카카오 주소 DB에 없는 번지 등 — 인근 도로번지 좌표로 대체 */
const MANUAL_COORDS_BY_NTT = {
  "295054": { lat: 37.3676928758109, lng: 126.944649335513 }
};

async function resolveCoords(row, restKey, cache) {
  const roadAddress = row.roadAddress.trim();
  const key = roadAddress;
  const manual = MANUAL_COORDS_BY_NTT[row.nttNo];
  if (manual) {
    cache[key] = manual;
    return manual;
  }
  if (cache[key]) {
    const { lat, lng } = cache[key];
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  for (const q of geocodeQueryVariants(roadAddress)) {
    let c = await kakaoAddressCoords(q, restKey);
    if (!c) c = await kakaoKeywordCoords(q, restKey);
    if (c) {
      cache[key] = c;
      return c;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  const nameQ = `${row.name} 군포`.trim();
  if (nameQ.length >= 4) {
    let c = await kakaoKeywordCoords(nameQ, restKey);
    if (c) {
      cache[key] = c;
      return c;
    }
  }
  if (row.dong && row.name) {
    let c = await kakaoKeywordCoords(`${row.dong} ${row.name}`, restKey);
    if (c) {
      cache[key] = c;
      return c;
    }
  }
  return null;
}

function rowToStore(row, lat, lng) {
  return {
    id: `gunpo-${row.nttNo}`,
    name: row.name,
    lat,
    lng,
    roadAddress: row.roadAddress,
    address: `${row.dong}`.trim() ? `군포시 ${row.dong}` : "",
    businessStatus: "영업",
    hasTrashBag: true,
    hasSpecialBag: false,
    hasLargeWasteSticker: false,
    adminVerified: false,
    dataReferenceDate: DATA_REF
  };
}

async function main() {
  loadEnvLocal();
  const restKey = process.env.KAKAO_REST_API_KEY ?? "";
  if (!restKey) {
    console.error("KAKAO_REST_API_KEY가 없습니다. frontend/.env.local 을 확인하세요.");
    process.exit(1);
  }

  const all = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    process.stderr.write(`페이지 ${p}/${TOTAL_PAGES} … `);
    const html = await fetchPage(p);
    const rows = extractRowsFromPage(html);
    all.push(...rows);
    process.stderr.write(`${rows.length}건\n`);
    await new Promise((r) => setTimeout(r, 200));
  }

  const byNtt = new Map();
  for (const r of all) {
    if (!byNtt.has(r.nttNo)) byNtt.set(r.nttNo, r);
  }
  const unique = [...byNtt.values()];
  console.error(`고유 게시글 ${unique.length}건 (nttNo 기준)`);

  const cache = loadCache();
  const stores = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < unique.length; i++) {
    const row = unique[i];
    const coords = await resolveCoords(row, restKey, cache);
    if (coords) {
      stores.push(rowToStore(row, coords.lat, coords.lng));
      ok++;
    } else {
      console.error(`좌표 실패: ${row.name} | ${row.roadAddress}`);
      fail++;
    }
    if ((i + 1) % 20 === 0) saveCache(cache);
    await new Promise((r) => setTimeout(r, 90));
  }

  saveCache(cache);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(stores, null, 2)}\n`, "utf8");
  console.error(`완료: 좌표 성공 ${ok}, 실패 ${fail} → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
