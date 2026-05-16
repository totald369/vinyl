/// <reference lib="webworker" />
/**
 * 검색 정렬 Web Worker.
 *
 * 메인 스레드에서 큰 stores 배열을 정렬·필터하면 INP 가 튀어, 작업을 워커로 분리.
 * `filterStoresForSearch` 와 정확히 동일한 로직을 워커에서 실행한다.
 */
import { filterStoresForSearch } from "@/lib/storeSearch";
import type { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { LatLng } from "@/lib/types";

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

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, stores, query, filter, referencePoint, limit } = ev.data;
  const result = filterStoresForSearch(stores, query, filter, referencePoint, limit);
  const msg: WorkerResponse = { id, result };
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg);
};

export {};
