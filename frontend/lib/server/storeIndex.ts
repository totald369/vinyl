/**
 * 매장 검색 인덱스 — getMergedStores() 결과에서 lazy singleton 1회 구축.
 *
 * 변경 전: 매 요청마다 배열 전체를 .filter/.find로 훑어 CPU·메모리 압력.
 * 변경 후: id/shortCode O(1), 반경 검색은 0.01° 그리드 9버킷만 후보 순회,
 *          검색은 행마다 문자열 결합 대신 사전 계산된 소문자 blob 조회,
 *          regionPath는 byRegionPath O(1) (전역 순회 제거).
 * dev HMR: globalThis에 인덱스 보관해 모듈 재평가 시 재구축 비용 제거.
 * 측정: /api/stores radius·search·region TTFB(서버 CPU 시간), cold path 대비 p95 Latency.
 */
import "server-only";

import type { StoreData } from "@/lib/storeData";
import { expandProvinceAliasesForSearch } from "@/lib/koreaProvinceAliases";
import { getMergedStores } from "@/lib/server/storeDataset";
import { isValidShortCode } from "@/lib/shortLink";

/** 위도·경도 버킷 크기(도). 인접 9칸이 대략 수 km 이내 후보를 커버. */
const GRID_STEP = 0.01;

export type StoreSearchIndexes = {
  byId: Map<string, StoreData>;
  byShortCode: Map<string, StoreData>;
  grid: Map<string, StoreData[]>;
  searchBlobLowerById: Map<string, string>;
  addressBlobLowerById: Map<string, string>;
  /** `leafToRegionPath(leaf)` 키 — 주소 needle 매칭된 매장(제품 필터 전) */
  byRegionPath: Map<string, StoreData[]>;
};

let cached: StoreSearchIndexes | null = null;

type GlobalWithStoreIdx = typeof globalThis & {
  __storeSearchIndexes?: StoreSearchIndexes | null;
};

function matchesAllNeedles(blobLower: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    const t = (n ?? "").trim().toLowerCase();
    if (!t) continue;
    if (!blobLower.includes(t)) return false;
  }
  return true;
}

function gridKey(lat: number, lng: number): string {
  const bi = Math.floor(lat / GRID_STEP);
  const bj = Math.floor(lng / GRID_STEP);
  return `${bi},${bj}`;
}

/** 반경 쿼리: 중심 셀 및 주변 8셀 키 (총 9) */
export function neighborGridKeys(lat: number, lng: number): string[] {
  const bi = Math.floor(lat / GRID_STEP);
  const bj = Math.floor(lng / GRID_STEP);
  const keys: string[] = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      keys.push(`${bi + di},${bj + dj}`);
    }
  }
  return keys;
}

function buildIndexes(): StoreSearchIndexes {
  const all = getMergedStores();
  const byId = new Map<string, StoreData>();
  const byShortCode = new Map<string, StoreData>();
  const grid = new Map<string, StoreData[]>();
  const searchBlobLowerById = new Map<string, string>();
  const addressBlobLowerById = new Map<string, string>();

  for (const s of all) {
    byId.set(s.id, s);

    const sc = s.shortCode?.trim();
    if (isValidShortCode(sc) && !byShortCode.has(sc)) {
      byShortCode.set(sc, s);
    }

    const gk = gridKey(s.lat, s.lng);
    const bucket = grid.get(gk);
    if (bucket) bucket.push(s);
    else grid.set(gk, [s]);

    const road = (s.roadAddress ?? "").trim();
    const addr = (s.address ?? "").trim();
    const name = (s.name ?? "").trim();
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
    searchBlobLowerById.set(s.id, expandProvinceAliasesForSearch(norm(`${name} ${road} ${addr}`)));
    addressBlobLowerById.set(s.id, expandProvinceAliasesForSearch(norm(`${road} ${addr}`)));
  }

  return {
    byId,
    byShortCode,
    grid,
    searchBlobLowerById,
    addressBlobLowerById,
    byRegionPath: new Map<string, StoreData[]>()
  };
}

/**
 * regionPath 버킷은 첫 조회 시에만 O(n) 구축 — 홈·반경 SSR/API는 byRegionPath를 건드리지 않음.
 * 변경 전: cold start마다 전 지역 × 전 매장 선형 스캔(수천만 회)으로 TTFB·리스트 API 지연.
 */
export function getRegionPathBucket(
  idx: StoreSearchIndexes,
  pathKey: string,
  needles: readonly string[]
): StoreData[] {
  const existing = idx.byRegionPath.get(pathKey);
  if (existing !== undefined) return existing;

  const bucket: StoreData[] = [];
  for (const s of idx.byId.values()) {
    const blob = idx.addressBlobLowerById.get(s.id) ?? "";
    if (matchesAllNeedles(blob, needles)) bucket.push(s);
  }
  idx.byRegionPath.set(pathKey, bucket);
  return bucket;
}

export function getStoreSearchIndexes(): StoreSearchIndexes {
  const g = globalThis as GlobalWithStoreIdx;
  if (g.__storeSearchIndexes) {
    cached = g.__storeSearchIndexes;
    return cached;
  }
  if (cached) return cached;

  const built = buildIndexes();
  cached = built;
  g.__storeSearchIndexes = built;
  return cached;
}

/** 그리드 인접 9버킷에 담긴 매장(중복 id 제거) */
export function collectGridBucketStores(idx: StoreSearchIndexes, lat: number, lng: number): StoreData[] {
  const seen = new Set<string>();
  const out: StoreData[] = [];
  for (const key of neighborGridKeys(lat, lng)) {
    const bucket = idx.grid.get(key);
    if (!bucket) continue;
    for (const s of bucket) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/**
 * 지정 반경(km) 안의 그리드 셀만 훑어 후보를 모음. 거리 검사는 호출자에서 수행.
 *
 * 변경 전: 검색(q=) 분기는 lat/lng 가 와도 99k 전체를 선형 스캔.
 * 변경 후: 사용자 위치가 있으면 radiusKm 만큼의 그리드 칸(수~수십개)만 후보로 추려
 *          텍스트 매칭 비용을 99k → 보통 수백~수천으로 축소.
 * 측정: /api/stores?q=... p95 응답 시간(서버 CPU 시간), 후보 매장 수 로그.
 */
export function collectStoresWithinRadius(
  idx: StoreSearchIndexes,
  lat: number,
  lng: number,
  radiusKm: number
): StoreData[] {
  const ringSteps = Math.max(1, Math.ceil(radiusKm / 1.1));
  const bi = Math.floor(lat / GRID_STEP);
  const bj = Math.floor(lng / GRID_STEP);
  const seen = new Set<string>();
  const out: StoreData[] = [];
  for (let di = -ringSteps; di <= ringSteps; di++) {
    for (let dj = -ringSteps; dj <= ringSteps; dj++) {
      const bucket = idx.grid.get(`${bi + di},${bj + dj}`);
      if (!bucket) continue;
      for (const s of bucket) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  return out;
}
