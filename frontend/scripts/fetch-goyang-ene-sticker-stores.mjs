#!/usr/bin/env node
/**
 * 고양환경에너지시설(ene.gys.or.kr) 폐기물스티커 판매업소 현황 → 카카오 지오코딩
 * https://ene.gys.or.kr/.../판매업소+현황
 *
 * 실행 (frontend 디렉터리):
 *   node scripts/fetch-goyang-ene-sticker-stores.mjs
 *
 * 필요: .env.local 의 KAKAO_REST_API_KEY
 * 결과: public/data/stores.goyang-sticker.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import iconv from "iconv-lite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public/data/stores.goyang-sticker.json");
const CACHE = path.join(__dirname, "geocode-cache-goyang-sticker.json");

const PAGE_URL =
  "https://ene.gys.or.kr/%EC%A2%85%EB%9F%89%EC%A0%9C%EB%B4%89%ED%88%AC%EA%B3%B5%EA%B8%89%EC%84%BC%ED%84%B0/%ED%8F%90%EA%B8%B0%EB%AC%BC%EC%8A%A4%ED%8B%B0%EC%BB%A4+%EA%B5%AC%EB%A7%A4/%ED%8C%90%EB%A7%A4%EC%97%85%EC%86%8C+%ED%98%84%ED%99%A9";

const DATA_REF = "2026-03-28";

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

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; trashbagmap-data/1.0; +https://www.trashbagmap.com)",
      Accept: "text/html,*/*"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("euc-kr")) return iconv.decode(buf, "euc-kr");
  return buf.toString("utf8");
}

function extractStickerStoresFromHtml(html) {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return [];
  const block = tbody[1];
  const rows = [];
  const trRe = /<tr>\s*([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(block))) {
    const inner = m[1];
    const allTds = [...inner.matchAll(/<td[^>]*>([^<]*)<\/td>/gi)];
    if (allTds.length < 3) continue;
    const adminDong = allTds[0][1].replace(/&nbsp;/g, " ").trim();
    const name = allTds[1][1].replace(/&nbsp;/g, " ").trim();
    const addr = allTds[2][1].replace(/&nbsp;/g, " ").trim();
    if (!name || !addr) continue;
    rows.push({ adminDong, name, addr });
  }
  return rows;
}

function roadAddressForStore(addr) {
  let a = addr.trim();
  a = a.replace(/고양시\s*동구\b/, "고양시 일산동구");
  a = a.replace(/견잘산로/g, "견달산로");
  if (/파주시|김포시|양주시/.test(a) && !/^경기/.test(a)) {
    return `경기도 ${a}`;
  }
  if (/^경기(도)?\s/.test(a)) return a;
  if (/^(서울|인천|부산|대구|광주|대전|울산)/.test(a)) return a;
  if (/^고양시\s/.test(a)) return `경기도 ${a}`;
  return `경기도 고양시 ${a}`;
}

function geocodeQueryVariants(roadAddress) {
  const full = roadAddress.trim();
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
  const noDupRoad = beforeParen.replace(/무원로\s+무원로/, "무원로").trim();
  const variants = [full, beforeParen, noFloorKorean, firstSeg, noMultiUnit, noFloor, noDupRoad].filter(
    (q, i, a) => q.length >= 8 && a.indexOf(q) === i
  );
  return variants;
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

async function resolveCoords(row, restKey, cache) {
  const roadAddress = row.roadAddress.trim();
  const key = roadAddress;
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
  const nameQ = `${row.name} 고양`.trim();
  if (nameQ.length >= 4) {
    const c = await kakaoKeywordCoords(nameQ, restKey);
    if (c) {
      cache[key] = c;
      return c;
    }
  }
  if (row.adminDong && row.name) {
    const c = await kakaoKeywordCoords(`${row.adminDong} ${row.name}`, restKey);
    if (c) {
      cache[key] = c;
      return c;
    }
  }
  return null;
}

async function main() {
  loadEnvLocal();
  const restKey = process.env.KAKAO_REST_API_KEY ?? "";
  if (!restKey) {
    console.error("KAKAO_REST_API_KEY가 없습니다. frontend/.env.local 을 확인하세요.");
    process.exit(1);
  }

  const html = await fetchHtml(PAGE_URL);
  const allRows = extractStickerStoresFromHtml(html);
  if (allRows.length === 0) {
    console.error("표에서 행을 찾지 못했습니다.");
    process.exit(1);
  }
  console.error(`수집 ${allRows.length}건`);

  const cache = loadCache();
  const out = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    const roadAddress = roadAddressForStore(r.addr);
    const row = {
      adminDong: r.adminDong,
      name: r.name,
      roadAddress
    };
    const coords = await resolveCoords(row, restKey, cache);
    if (coords) {
      const id = `goyang-ene-sticker-${i}`;
      out.push({
        id,
        name: r.name,
        lat: coords.lat,
        lng: coords.lng,
        roadAddress,
        address: r.adminDong ? `고양시 ${r.adminDong}` : "고양시",
        businessStatus: "영업",
        hasTrashBag: false,
        hasSpecialBag: false,
        hasLargeWasteSticker: true,
        adminVerified: false,
        dataReferenceDate: DATA_REF
      });
      ok++;
    } else {
      console.error(`좌표 실패: ${r.name} | ${roadAddress}`);
      fail++;
    }
    if ((i + 1) % 25 === 0) saveCache(cache);
    await new Promise((r) => setTimeout(r, 85));
  }

  saveCache(cache);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.error(`완료: ${out.length}건 (성공 ${ok}, 실패 ${fail}) → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
