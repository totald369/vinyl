#!/usr/bin/env node
/**
 * public/data/reports_rows.json 중 lat/lng가 없는 제보 행에 대해
 * road_address(+ detail_address)로 카카오 주소 검색 후 좌표를 채웁니다.
 *
 * 사용: frontend 디렉터리에서
 *   KAKAO_REST_API_KEY=... node scripts/geocode-reports-rows.mjs
 *
 * 또는 .env.local에 KAKAO_REST_API_KEY가 있으면 자동 로드합니다.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REPORTS_PATH = path.join(ROOT, "public/data/reports_rows.json");

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

async function kakaoAddressFirstCoords(query, restKey) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "1");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`address.json ${res.status}: ${t}`);
  }
  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) return null;
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function kakaoKeywordFirstCoords(query, restKey) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "1");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`keyword.json ${res.status}: ${t}`);
  }
  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) return null;
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function buildQuery(row) {
  const road = (row.road_address ?? "").trim();
  const detail = (row.detail_address ?? "").trim();
  if (road && detail) return `${road} ${detail}`;
  return road || detail || (row.name ?? "").trim();
}

async function main() {
  loadEnvLocal();
  const restKey = process.env.KAKAO_REST_API_KEY ?? "";
  if (!restKey) {
    console.error("KAKAO_REST_API_KEY가 필요합니다.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(REPORTS_PATH, "utf8"));
  if (!Array.isArray(raw)) {
    console.error("reports_rows.json은 배열이어야 합니다.");
    process.exit(1);
  }

  let updated = 0;
  for (const row of raw) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) continue;

    const q = buildQuery(row);
    if (!q) {
      console.warn("건너뜀(주소 없음):", row.id);
      continue;
    }

    let coords = await kakaoAddressFirstCoords(q, restKey);
    if (!coords) coords = await kakaoKeywordFirstCoords(q, restKey);
    if (!coords) {
      console.warn("좌표 없음:", row.id, q);
      continue;
    }
    row.lat = coords.lat;
    row.lng = coords.lng;
    updated += 1;
    await new Promise((r) => setTimeout(r, 120));
  }

  fs.writeFileSync(REPORTS_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  console.log(`완료: ${updated}건 좌표 보강 → ${REPORTS_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
