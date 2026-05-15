/**
 * /api/stores — 목록·반경·검색·디테일·숏코드 분기.
 *
 * 변경 전: 매 요청 getMergedStores() 후 전 배열 filter/sort, Cache-Control private만 사용 →
 *          엣지 캐시 불가 + CPU 풀스캔 반복.
 * 변경 후: storeIndex(그리드·Map·검색 blob)로 후보 축소 및 O(1) 조회,
 *          검색/radius/district는 public s-maxage로 CDN·Vercel Data Cache 활용.
 * 측정: radius/search p95 응답 시간, Vercel Edge cached 응답 비율(Cache status), 서버 CPU time.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getDistrictTrashbagConfig } from "@/lib/districtTrashbagSeo";
import {
  parseSearchTokens,
  precomputeHangulTokens,
  textMatchesAllTokens
} from "@/lib/searchTokens";
import {
  collectGridBucketStores,
  collectStoresWithinRadius,
  getStoreSearchIndexes
} from "@/lib/server/storeIndex";
import {
  checkRateLimit,
  checkReferer,
  checkUserAgent,
  getClientIp
} from "@/lib/server/storesApiSecurity";
import { leafToRegionPath, resolveRegionLeafFromSlugPath } from "@/lib/koreaRegions";
import { isValidShortCode } from "@/lib/shortLink";
import type { StoreData } from "@/lib/storeData";
import { getDistanceKm } from "@/lib/utils";

export const runtime = "nodejs";

const DEFAULT_RADIUS_KM = 2;
const MAX_RADIUS_KM = 2;

/**
 * short/detail: 개인화·민감 가능 → private. 그 외 공개 캐시로 엣지 재사용.
 *
 * 변경 전: s-maxage=60 → 트래픽 낮은 시간대에는 거의 매 요청이 origin 도달.
 * 변경 후: 데이터는 배포 시점에만 갱신되므로 10분 캐시 + 1시간 SWR 로 origin 부하/p95 단축.
 *          (배포 즉시 반영이 필요하면 next deploy 시 자동 무효화되거나 max-age 단축으로 회귀 가능)
 */
const CACHE_PRIVATE = "private, max-age=60, stale-while-revalidate=120";
const CACHE_PUBLIC = "public, s-maxage=600, stale-while-revalidate=3600";

/** region 모드 JSON 직렬화·정렬 결과 재사용 (동일 regionPath·offset·필터·정렬기준) */
const REGION_RESPONSE_LRU_MAX = 96;
const regionResponseLru = new Map<string, unknown>();

function regionLruTouch(key: string, val: unknown) {
  if (regionResponseLru.has(key)) regionResponseLru.delete(key);
  regionResponseLru.set(key, val);
  while (regionResponseLru.size > REGION_RESPONSE_LRU_MAX) {
    const first = regionResponseLru.keys().next().value as string | undefined;
    if (first === undefined) break;
    regionResponseLru.delete(first);
  }
}

function regionLruGet(key: string): unknown | undefined {
  const v = regionResponseLru.get(key);
  if (v === undefined) return undefined;
  regionResponseLru.delete(key);
  regionResponseLru.set(key, v);
  return v;
}

/** 검색(q) 매칭 후 거리순으로 잘라 보내는 상한. */
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

/** 클라이언트 무한 스크롤 페이지 크기( useStores SEARCH_PAGE_SIZE )와 맞춤 */
const SEARCH_PAGE_DEFAULT = 30;
const SEARCH_PAGE_MAX = 200;

/** 지역 목록 무한 스크롤 페이지 크기 */
const REGION_PAGE_DEFAULT = 40;
const REGION_PAGE_MAX = 120;

function parseRegionOffsetLimit(searchParams: URLSearchParams): { offset: number; limit: number } {
  let offset = Number(searchParams.get("offset"));
  let limit = Number(searchParams.get("limit"));
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  if (!Number.isFinite(limit) || limit < 1) limit = REGION_PAGE_DEFAULT;
  limit = Math.min(Math.max(Math.floor(limit), 1), REGION_PAGE_MAX);
  offset = Math.max(0, Math.floor(offset));
  return { offset, limit };
}

function matchesAllNeedles(blobLower: string, needles: string[]): boolean {
  for (const n of needles) {
    const t = (n ?? "").trim().toLowerCase();
    if (!t) continue;
    if (!blobLower.includes(t)) return false;
  }
  return true;
}

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

function roundCoord6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * 변경 전: list 모드 응답에서 dataReferenceDate / phone / businessStatus 제거 →
 *         시트 열 때 /api/stores?id= 2-hop fetch 가 필수, RTT 만큼 스켈레톤 노출.
 * 변경 후: list 응답에도 포함 → 클라이언트 `storeRowNeedsDetailFetch` 가 false 가 되어
 *         augment 라운드트립 자체가 사라짐. 시트가 즉시 본문 렌더.
 *         페이로드 증가: 30행 기준 ~1KB 미만(brotli 후 거의 무의미).
 */
function toListStore(s: StoreData, distanceKm?: number) {
  const road = (s.roadAddress ?? s.address ?? "").trim();
  const phone = s.phone?.trim();
  return {
    id: s.id,
    name: s.name,
    lat: roundCoord6(s.lat),
    lng: roundCoord6(s.lng),
    roadAddress: road,
    address: road,
    shortCode: s.shortCode ?? "",
    hasTrashBag: s.hasTrashBag,
    hasSpecialBag: s.hasSpecialBag,
    hasLargeWasteSticker: s.hasLargeWasteSticker,
    adminVerified: s.adminVerified === true,
    /** "" 도 hasOwnProperty 가 true → useStoreDetailAugment 가 fetch 를 건너뜀. */
    dataReferenceDate: s.dataReferenceDate ?? "",
    businessStatus: s.businessStatus ?? "",
    ...(phone ? { phone } : {}),
    ...(distanceKm != null ? { distance: distanceKm } : {})
  };
}

/** 디테일 응답은 list 와 동일 shape — 별도 augment fetch 가 사라졌지만 short/id 직접 조회는 유지. */
function toDetailStore(s: StoreData, distanceKm?: number) {
  return toListStore(s, distanceKm);
}

function jsonCached(data: unknown, visibility: "private" | "public") {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": visibility === "public" ? CACHE_PUBLIC : CACHE_PRIVATE
    }
  });
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
  if (!isLocalDev) {
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  const { searchParams } = new URL(request.url);
  const districtSlug = searchParams.get("district")?.trim() ?? "";
  const qRaw = searchParams.get("q")?.trim() ?? "";
  const shortParamEarly = searchParams.get("short")?.trim() ?? "";

  let idx: ReturnType<typeof getStoreSearchIndexes>;
  try {
    idx = getStoreSearchIndexes();
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  /** 숏코드: 인덱스 O(1) — 기존 .find/full scan 제거 */
  if (isValidShortCode(shortParamEarly)) {
    const store = idx.byShortCode.get(shortParamEarly);
    if (!store) {
      return jsonCached({ mode: "short", stores: [] }, "private");
    }
    const originForDist = parseLatLng(searchParams);
    const d =
      originForDist != null
        ? getDistanceKm(originForDist.lat, originForDist.lng, store.lat, store.lng)
        : undefined;
    return jsonCached(
      {
        mode: "short",
        stores: [{ ...toDetailStore(store, d), shortCode: shortParamEarly }]
      },
      "private"
    );
  }

  const regionPathEncoded = searchParams.get("regionPath")?.trim() ?? "";
  if (regionPathEncoded) {
    const segments = regionPathEncoded
      .split("/")
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
    const leaf = resolveRegionLeafFromSlugPath(segments);
    if (!leaf) {
      return NextResponse.json({ error: "invalid_region" }, { status: 400 });
    }
    const productFilter = parseProductFilter(searchParams);
    const { offset, limit } = parseRegionOffsetLimit(searchParams);
    const regionPathKey = leafToRegionPath(leaf);
    const originOpt = parseLatLng(searchParams);
    const lruKey = [
      regionPathKey,
      productFilter,
      String(offset),
      String(limit),
      originOpt ? `${originOpt.lat},${originOpt.lng}` : ""
    ].join("\x1e");
    const lruHit = regionLruGet(lruKey);
    if (lruHit != null) {
      return jsonCached(lruHit, "public");
    }

    const pathBucket = idx.byRegionPath.get(regionPathKey);
    let candidates: StoreData[];
    if (pathBucket !== undefined) {
      candidates = [];
      for (const s of pathBucket) {
        if (!matchesProductFilter(s, productFilter)) continue;
        candidates.push(s);
      }
    } else {
      candidates = [];
      for (const s of idx.byId.values()) {
        if (!matchesProductFilter(s, productFilter)) continue;
        const blob = idx.addressBlobLowerById.get(s.id) ?? "";
        if (!matchesAllNeedles(blob, leaf.needles)) continue;
        candidates.push(s);
      }
    }

    type SortRow = { store: StoreData; d: number };
    let sorted: SortRow[];
    if (originOpt != null) {
      sorted = candidates.map((store) => ({
        store,
        d: getDistanceKm(originOpt.lat, originOpt.lng, store.lat, store.lng)
      }));
      sorted.sort((a, b) => a.d - b.d);
    } else {
      sorted = candidates
        .map((store) => ({ store, d: NaN }))
        .sort((a, b) =>
          (a.store.name ?? "").localeCompare(b.store.name ?? "", "ko", {
            sensitivity: "base"
          })
        );
    }

    const total = sorted.length;
    const pageSlice = sorted.slice(offset, offset + limit);
    const hasMore = offset + pageSlice.length < total;

    const regionPayload = {
      mode: "region",
      total,
      offset,
      limit,
      hasMore,
      headingLabelKo: leaf.headingLabelKo,
      province: leaf.shortNameKo,
      city:
        leaf.cityNameKo ??
        (!leaf.citySlug && leaf.districtNameKo ? leaf.districtNameKo : ""),
      district: leaf.citySlug ? (leaf.districtNameKo ?? "") : "",
      stores: pageSlice.map(({ store, d }) =>
        toListStore(store, Number.isFinite(d) ? d : undefined)
      )
    };
    regionLruTouch(lruKey, regionPayload);
    return jsonCached(regionPayload, "public");
  }

  const origin = parseLatLng(searchParams);
  if (!origin) {
    return NextResponse.json(
      { error: "invalid_params", message: "lat, lng 가 필요합니다." },
      { status: 400 }
    );
  }

  if (districtSlug) {
    const cfg = getDistrictTrashbagConfig(districtSlug);
    if (!cfg) {
      return NextResponse.json({ error: "invalid_district" }, { status: 400 });
    }
    const needle = cfg.addressKeyword.toLowerCase();
    const filtered: StoreData[] = [];
    for (const s of idx.byId.values()) {
      const blob = idx.addressBlobLowerById.get(s.id) ?? "";
      if (blob.includes(needle)) filtered.push(s);
    }
    const withDist = filtered.map((s) => ({
      store: s,
      d: getDistanceKm(origin.lat, origin.lng, s.lat, s.lng)
    }));
    withDist.sort((a, b) => a.d - b.d);
    return jsonCached({
      mode: "district",
      stores: withDist.map(({ store, d }) => toListStore(store, d))
    }, "public");
  }

  const detailId = searchParams.get("id")?.trim() ?? "";
  if (detailId) {
    const store = idx.byId.get(detailId);
    if (!store) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const d = getDistanceKm(origin.lat, origin.lng, store.lat, store.lng);
    return jsonCached({ mode: "detail", store: toDetailStore(store, d) }, "private");
  }

  if (qRaw) {
    const tokens = parseSearchTokens(qRaw);
    if (!tokens.length) {
      return jsonCached(
        {
          mode: "search",
          total: 0,
          offset: 0,
          limit: SEARCH_PAGE_DEFAULT,
          hasMore: false,
          stores: []
        },
        "public"
      );
    }
    const productFilter = parseProductFilter(searchParams);
    const { offset: rawOffset, limit } = parseSearchOffsetLimit(searchParams);
    const maxServe = getSearchLimit();

    /**
     * 변경 전: 99k 전체를 매 검색마다 선형 스캔.
     * 변경 후: 1) 토큰 한글 변환 1회 메모이제이션, 2) 사용자 좌표 주변 반경 후보로 사전 필터,
     *          3) 후보가 너무 적으면 전역 스캔 폴백 (예: "전주" in 서울 origin) — 정확성 유지.
     * 측정: 후보 매장 수, 매칭/정렬 self time, p95 응답 시간.
     */
    const hangulTokens = precomputeHangulTokens(tokens);

    const runMatch = (pool: Iterable<StoreData>): StoreData[] => {
      const out: StoreData[] = [];
      for (const s of pool) {
        if (!matchesProductFilter(s, productFilter)) continue;
        const blob = idx.searchBlobLowerById.get(s.id) ?? "";
        if (!textMatchesAllTokens(blob, tokens, hangulTokens)) continue;
        out.push(s);
      }
      return out;
    };

    const FAST_RADIUS_KM = 30;
    /**
     * 사용자 좌표 주변에서 한 페이지(30개)를 못 채우면 전역 스캔으로 폴백.
     * 예) 사용자는 서울에 있고 "전주" 검색 — 주변에 매칭이 거의 없으면 전라북도 매장으로 채움.
     */
    const FALLBACK_THRESHOLD = SEARCH_PAGE_DEFAULT;

    let candidates = runMatch(
      collectStoresWithinRadius(idx, origin.lat, origin.lng, FAST_RADIUS_KM)
    );

    if (candidates.length < FALLBACK_THRESHOLD) {
      candidates = runMatch(idx.byId.values());
    }

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

    return jsonCached({
      mode: "search",
      total,
      offset,
      limit,
      hasMore,
      stores: page.map(({ store, d }) => toListStore(store, d))
    }, "public");
  }

  let radiusKm = Number(searchParams.get("radiusKm"));
  if (!Number.isFinite(radiusKm)) radiusKm = DEFAULT_RADIUS_KM;
  radiusKm = Math.min(Math.max(radiusKm, 0.1), MAX_RADIUS_KM);

  /** 반경: 그리드 9버킷 후보만 거리 계산 — 기존 전 배열 map+filter 제거 */
  const candidates = collectGridBucketStores(idx, origin.lat, origin.lng);
  const inRadius = candidates
    .map((s) => ({
      store: s,
      d: getDistanceKm(origin.lat, origin.lng, s.lat, s.lng)
    }))
    .filter(({ d }) => d <= radiusKm)
    .sort((a, b) => a.d - b.d);

  return jsonCached({
    mode: "radius",
    radiusKm,
    stores: inRadius.map(({ store, d }) => toListStore(store, d))
  }, "public");
}
