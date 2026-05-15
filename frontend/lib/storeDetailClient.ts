/**
 * Lazy store detail: list API returns lean rows; open sheet then fetches full row by id.
 * Dedupes in-flight requests and caches by id only (distance computed per call).
 *
 * 변경 전: 캐시 키 = `${id}:${origin.lat.toFixed(5)}:${origin.lng.toFixed(5)}` → 동일 매장이라도
 *          지도 중심이 약 1m만 달라져도 cache miss 로 동일 데이터 재요청.
 * 변경 후: 캐시 키 = id 만, 거리는 좌표 기반으로 클라이언트에서 재계산해 store.distance 에 주입.
 *          → prefetch 효율 상승, 시트 재오픈 즉시 채움.
 * 측정: 동일 매장 클릭 시 추가 /api/stores?id= 발생 여부, 시트 첫 렌더 ~ 본문 채워지는 시간.
 */
import type { StoreData } from "@/lib/storeData";
import type { LatLng } from "@/lib/types";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";
import { getDistanceKm } from "@/lib/utils";

type DetailResponse = { mode?: string; store?: StoreData };

const cache = new Map<string, StoreData>();
const inflight = new Map<string, Promise<StoreData>>();

/** 목록 행 호버/터치 연쇄로 디테일 API가 순간 폭주하는 것 방지 — 직렬 + 간격만 적용 (`fetchStoreDetail` 직호출은 즉시) */
type PrefetchJob = { id: string; origin: LatLng };
const prefetchQueue: PrefetchJob[] = [];
let prefetchDraining = false;

const PREFETCH_SPACING_MS = 320;

function enqueuePrefetch(job: PrefetchJob): boolean {
  if (cache.has(job.id) || inflight.has(job.id)) return false;
  if (prefetchQueue.some((p) => p.id === job.id)) return false;
  prefetchQueue.push(job);
  return true;
}

async function drainPrefetchQueue(): Promise<void> {
  if (prefetchDraining) return;
  prefetchDraining = true;
  try {
    while (prefetchQueue.length > 0) {
      const job = prefetchQueue.shift()!;
      if (cache.has(job.id) || inflight.has(job.id)) continue;
      try {
        await fetchStoreDetail(job.id, job.origin);
      } catch {
        /* 429/네트워크 — 무시 (시트 열 때 즉시 fetch 재시도) */
      }
      if (prefetchQueue.length > 0) {
        await new Promise((r) => setTimeout(r, PREFETCH_SPACING_MS));
      }
    }
  } finally {
    prefetchDraining = false;
    if (prefetchQueue.length > 0) void drainPrefetchQueue();
  }
}

function withDistance(store: StoreData, origin: LatLng): StoreData {
  const d = getDistanceKm(origin.lat, origin.lng, store.lat, store.lng);
  if (typeof store.distance === "number" && Math.abs(store.distance - d) < 1e-6) {
    return store;
  }
  return { ...store, distance: d };
}

export function getCachedStoreDetail(id: string, origin: LatLng): StoreData | undefined {
  const hit = cache.get(id);
  return hit ? withDistance(hit, origin) : undefined;
}

/** Warm cache from hover / touchstart without awaiting */
export function prefetchStoreDetail(id: string, origin: LatLng): void {
  if (enqueuePrefetch({ id, origin })) void drainPrefetchQueue();
}

export async function fetchStoreDetail(
  id: string,
  origin: LatLng,
  opts?: { signal?: AbortSignal }
): Promise<StoreData> {
  const hit = cache.get(id);
  if (hit) return withDistance(hit, origin);

  const pending = inflight.get(id);
  if (pending) return pending.then((s) => withDistance(s, origin));

  const label = `[perf] store-detail-fetch:${id}`;
  perfTimeStart(label);

  const p = (async () => {
    const params = new URLSearchParams();
    params.set("lat", String(origin.lat));
    params.set("lng", String(origin.lng));
    params.set("id", id);
    const res = await fetch(`/api/stores?${params.toString()}`, {
      signal: opts?.signal,
      cache: "default"
    });
    if (!res.ok) {
      throw new Error(`detail ${res.status}`);
    }
    const data = (await res.json()) as DetailResponse;
    const store = data.store;
    if (!store?.id) {
      throw new Error("detail_missing");
    }
    cache.set(id, store);
    return store;
  })();

  inflight.set(id, p);
  try {
    const store = await p;
    return withDistance(store, origin);
  } finally {
    inflight.delete(id);
    perfTimeEnd(label);
  }
}

/** List JSON omits `dataReferenceDate`; avoid refetch loops when the field exists but is empty */
export function storeRowNeedsDetailFetch(s: StoreData): boolean {
  return !Object.prototype.hasOwnProperty.call(s, "dataReferenceDate");
}
