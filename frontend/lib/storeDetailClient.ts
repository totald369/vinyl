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

function cacheKey(id: string, origin: LatLng): string {
  return `${id}:${origin.lat.toFixed(5)}:${origin.lng.toFixed(5)}`;
}

export function getCachedStoreDetail(id: string, origin: LatLng): StoreData | undefined {
  return cache.get(cacheKey(id, origin));
}

/** Warm cache from hover / touchstart without awaiting */
export function prefetchStoreDetail(id: string, origin: LatLng): void {
  const key = cacheKey(id, origin);
  if (cache.has(key) || inflight.has(key)) return;
  void fetchStoreDetail(id, origin);
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
