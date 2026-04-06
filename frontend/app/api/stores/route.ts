import { NextResponse, type NextRequest } from "next/server";

import { getDistrictTrashbagConfig } from "@/lib/districtTrashbagSeo";
import { parseSearchTokens, textMatchesAllTokens } from "@/lib/searchTokens";
import { getMergedStores } from "@/lib/server/storeDataset";
import {
  checkRateLimit,
  checkReferer,
  checkUserAgent,
  getClientIp
} from "@/lib/server/storesApiSecurity";
import type { StoreData } from "@/lib/storeData";
import { getDistanceKm } from "@/lib/utils";

export const runtime = "nodejs";

const DEFAULT_RADIUS_KM = 2;
const MAX_RADIUS_KM = 2;

/** 검색(q) 매칭 후 거리순으로 잘라 보내는 상한. 경기도 등 광역 검색 시 수만 건이 필요해 150은 부족함. */
function getSearchLimit(): number {
  const raw = process.env.STORES_SEARCH_LIMIT;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return Math.min(100000, Math.max(500, Math.floor(n)));
    }
  }
  return 25000;
}

const SEARCH_PAGE_DEFAULT = 100;
const SEARCH_PAGE_MAX = 200;

function parseSearchOffsetLimit(searchParams: URLSearchParams): { offset: number; limit: number } {
  let offset = Number(searchParams.get("offset"));
  let limit = Number(searchParams.get("limit"));
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  if (!Number.isFinite(limit) || limit < 1) limit = SEARCH_PAGE_DEFAULT;
  limit = Math.min(Math.max(Math.floor(limit), 1), SEARCH_PAGE_MAX);
  offset = Math.max(0, Math.floor(offset));
  return { offset, limit };
}

type ProductFilter = "payBag" | "nonBurnable" | "largeSticker";

function parseProductFilter(searchParams: URLSearchParams): ProductFilter {
  const f = searchParams.get("filter")?.trim();
  if (f === "nonBurnable" || f === "largeSticker") return f;
  return "payBag";
}

function matchesProductFilter(s: StoreData, filter: ProductFilter): boolean {
  if (filter === "nonBurnable") return s.hasSpecialBag;
  if (filter === "largeSticker") return s.hasLargeWasteSticker;
  return s.hasTrashBag;
}

/** 클라이언트에 노출하는 최소 필드 */
function toPublicStore(s: StoreData, distanceKm?: number) {
  const road = (s.roadAddress ?? s.address ?? "").trim();
  return {
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    roadAddress: road,
    address: road,
    hasTrashBag: s.hasTrashBag,
    hasSpecialBag: s.hasSpecialBag,
    hasLargeWasteSticker: s.hasLargeWasteSticker,
    adminVerified: s.adminVerified === true,
    dataReferenceDate: s.dataReferenceDate,
    ...(distanceKm != null ? { distance: distanceKm } : {})
  };
}

function parseLatLng(searchParams: URLSearchParams): { lat: number; lng: number } | null {
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(request: NextRequest) {
  const ua = checkUserAgent(request);
  if (!ua.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const host = request.headers.get("host") ?? "";
  const isLocalDev =
    process.env.NODE_ENV === "development" &&
    (host.startsWith("localhost") || host.startsWith("127.0.0.1"));

  if (!isLocalDev) {
    const ref = checkReferer(request);
    if (!ref.ok) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const districtSlug = searchParams.get("district")?.trim() ?? "";
  const qRaw = searchParams.get("q")?.trim() ?? "";

  const origin = parseLatLng(searchParams);
  if (!origin) {
    return NextResponse.json(
      { error: "invalid_params", message: "lat, lng 가 필요합니다." },
      { status: 400 }
    );
  }

  let all: StoreData[];
  try {
    all = getMergedStores();
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // --- 구 SEO 페이지: 화이트리스트 slug만 허용, 주소 키워드로 필터 ---
  if (districtSlug) {
    const cfg = getDistrictTrashbagConfig(districtSlug);
    if (!cfg) {
      return NextResponse.json({ error: "invalid_district" }, { status: 400 });
    }
    const needle = cfg.addressKeyword.toLowerCase();
    const filtered = all.filter((s) => {
      const blob = `${s.roadAddress ?? ""} ${s.address ?? ""}`.toLowerCase();
      return blob.includes(needle);
    });
    const withDist = filtered.map((s) => ({
      store: s,
      d: getDistanceKm(origin.lat, origin.lng, s.lat, s.lng)
    }));
    withDist.sort((a, b) => a.d - b.d);
    return NextResponse.json({
      mode: "district",
      stores: withDist.map(({ store, d }) => toPublicStore(store, d))
    });
  }

  // --- 검색: 토큰 매칭 + 상품 필터 후 거리순, total 노출·offset/limit 페이지 ---
  if (qRaw) {
    const tokens = parseSearchTokens(qRaw);
    if (!tokens.length) {
      return NextResponse.json({
        mode: "search",
        total: 0,
        offset: 0,
        limit: SEARCH_PAGE_DEFAULT,
        hasMore: false,
        stores: []
      });
    }
    const productFilter = parseProductFilter(searchParams);
    const { offset: rawOffset, limit } = parseSearchOffsetLimit(searchParams);
    const maxServe = getSearchLimit();

    const candidates = all.filter((s) => {
      if (!matchesProductFilter(s, productFilter)) return false;
      const blob = `${s.name} ${s.roadAddress ?? ""} ${s.address ?? ""}`.toLowerCase();
      return textMatchesAllTokens(blob, tokens);
    });
    const withDist = candidates.map((s) => ({
      store: s,
      d: getDistanceKm(origin.lat, origin.lng, s.lat, s.lng)
    }));
    withDist.sort((a, b) => a.d - b.d);

    const total = withDist.length;
    const capped = withDist.slice(0, maxServe);
    const offset = Math.min(rawOffset, capped.length);
    const page = capped.slice(offset, offset + limit);
    const hasMore = offset + page.length < capped.length;

    return NextResponse.json({
      mode: "search",
      total,
      offset,
      limit,
      hasMore,
      stores: page.map(({ store, d }) => toPublicStore(store, d))
    });
  }

  // --- 기본: 반경(최대 2km) ---
  let radiusKm = Number(searchParams.get("radiusKm"));
  if (!Number.isFinite(radiusKm)) radiusKm = DEFAULT_RADIUS_KM;
  radiusKm = Math.min(Math.max(radiusKm, 0.1), MAX_RADIUS_KM);

  const inRadius = all
    .map((s) => ({
      store: s,
      d: getDistanceKm(origin.lat, origin.lng, s.lat, s.lng)
    }))
    .filter(({ d }) => d <= radiusKm)
    .sort((a, b) => a.d - b.d);

  return NextResponse.json({
    mode: "radius",
    radiusKm,
    stores: inRadius.map(({ store, d }) => toPublicStore(store, d))
  });
}
