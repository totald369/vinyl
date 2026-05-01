/**
 * 매장 검색 인덱스 — getMergedStores() 결과에서 한 번만 구축(모듈 캐시).
 *
 * 변경 전: 매 요청마다 배열 전체를 .filter/.find로 훑어 CPU·메모리 압력.
 * 변경 후: id/shortCode O(1), 반경 검색은 0.01° 그리드 9버킷만 후보 순회,
 *          검색은 행마다 문자열 결합 대신 사전 계산된 소문자 blob 조회.
 * 측정: /api/stores radius·search TTFB(서버 CPU 시간), cold path 대비 p95 Latency.
 */
import type { StoreData } from "@/lib/storeData";
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
};

let cached: StoreSearchIndexes | null = null;

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

export function getStoreSearchIndexes(): StoreSearchIndexes {
  if (cached) return cached;

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
    searchBlobLowerById.set(s.id, norm(`${name} ${road} ${addr}`));
    addressBlobLowerById.set(s.id, norm(`${road} ${addr}`));
  }

  cached = {
    byId,
    byShortCode,
    grid,
    searchBlobLowerById,
    addressBlobLowerById
  };
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
