/**
 * Lazy store detail: list API returns lean rows; open sheet then fetches full row by id.
 * Dedupes in-flight requests and caches by id + origin (for distance field).
 */
import type { StoreData } from "@/lib/storeData";
import type { LatLng } from "@/lib/types";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";

type DetailResponse = { mode?: string; store?: StoreData };

const cache = new Map<string, StoreData>();
const inflight = new Map<string, Promise<StoreData>>();

/** 목록 행 호버/터치 연쇄로 디테일 API가 순간 폭주하는 것 방지 — 직렬 + 간격만 적용 (`fetchStoreDetail` 직호출은 즉시) */
type PrefetchJob = { id: string; origin: LatLng };
const prefetchQueue: PrefetchJob[] = [];
let prefetchDraining = false;

const PREFETCH_SPACING_MS = 320;

function enqueuePrefetch(job: PrefetchJob): boolean {
  const key = cacheKey(job.id, job.origin);
  if (cache.has(key) || inflight.has(key)) return false;
  if (prefetchQueue.some((p) => cacheKey(p.id, p.origin) === key)) return false;
  prefetchQueue.push(job);
  return true;
}

async function drainPrefetchQueue(): Promise<void> {
  if (prefetchDraining) return;
  prefetchDraining = true;
  try {
    while (prefetchQueue.length > 0) {
      const job = prefetchQueue.shift()!;
      const key = cacheKey(job.id, job.origin);
      if (cache.has(key) || inflight.has(key)) continue;
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

function cacheKey(id: string, origin: LatLng): string {
  return `${id}:${origin.lat.toFixed(5)}:${origin.lng.toFixed(5)}`;
}

export function getCachedStoreDetail(id: string, origin: LatLng): StoreData | undefined {
  return cache.get(cacheKey(id, origin));
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
  const key = cacheKey(id, origin);
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

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
    cache.set(key, store);
    return store;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
    perfTimeEnd(label);
  }
}

/** List JSON omits `dataReferenceDate`; avoid refetch loops when the field exists but is empty */
export function storeRowNeedsDetailFetch(s: StoreData): boolean {
  return !Object.prototype.hasOwnProperty.call(s, "dataReferenceDate");
}
