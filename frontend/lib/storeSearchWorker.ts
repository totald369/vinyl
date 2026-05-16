/**
 * [INP] 큰 리스트 검색·정렬을 Web Worker 로 이전.
 * - 메인 스레드 차단을 피해 INP 안정화.
 * - small list(< THRESHOLD) 는 worker 송수신 비용이 더 커서 메인 스레드 동기 실행.
 * - 큰 region 페이지 누적 / 검색 후보가 많을 때만 worker 활용.
 */
import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import { filterStoresForSearch } from "@/lib/storeSearch";
import type { LatLng } from "@/lib/types";

const WORKER_THRESHOLD = 400;

type WorkerRequest = {
  id: number;
  stores: StoreData[];
  query: string;
  filter: StoreListFilter;
  referencePoint: LatLng;
  limit?: number;
};

type WorkerResponse = {
  id: number;
  result: StoreData[];
};

let workerInstance: Worker | null = null;
let workerSeq = 0;
const pending = new Map<number, (rows: StoreData[]) => void>();

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(new URL("./storeSearch.worker.ts", import.meta.url), {
      type: "module"
    });
    workerInstance.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const cb = pending.get(ev.data.id);
      if (!cb) return;
      pending.delete(ev.data.id);
      cb(ev.data.result);
    };
    workerInstance.onerror = () => {
      /* 워커 실패 시 cleanup — 다음 호출은 메인 스레드 fallback */
      for (const cb of pending.values()) cb([]);
      pending.clear();
      try {
        workerInstance?.terminate();
      } catch {
        /* ignore */
      }
      workerInstance = null;
    };
    return workerInstance;
  } catch {
    return null;
  }
}

/**
 * 동기 fallback: 작은 데이터셋, worker 미지원, worker 초기화 실패 시 메인 스레드 실행.
 */
export function filterStoresForSearchSync(
  stores: StoreData[],
  query: string,
  filter: StoreListFilter,
  referencePoint: LatLng,
  limit?: number
): StoreData[] {
  return filterStoresForSearch(stores, query, filter, referencePoint, limit);
}

/**
 * 비동기: stores.length 가 임계값 이상이면 worker 로 위임, 아니면 동기 실행.
 * 결과는 항상 Promise 형태로 통일해 호출부 단순화.
 */
export function filterStoresForSearchAsync(
  stores: StoreData[],
  query: string,
  filter: StoreListFilter,
  referencePoint: LatLng,
  limit?: number
): Promise<StoreData[]> {
  if (stores.length < WORKER_THRESHOLD) {
    return Promise.resolve(filterStoresForSearch(stores, query, filter, referencePoint, limit));
  }
  const w = getWorker();
  if (!w) {
    return Promise.resolve(filterStoresForSearch(stores, query, filter, referencePoint, limit));
  }
  const id = ++workerSeq;
  const req: WorkerRequest = { id, stores, query, filter, referencePoint, limit };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage(req);
  });
}
