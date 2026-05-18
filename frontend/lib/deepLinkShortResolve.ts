import type { StoreData } from "@/hooks/useStores";
import { isValidShortCode } from "@/lib/shortLinkCore";

export const DEEPLINK_LOG_PREFIX = "[deeplink]";

export type FetchStoreByShortResult = {
  row: StoreData | null;
  requestUrl: string;
  httpOk: boolean;
  httpStatus?: number;
};

/**
 * 공유 shortCode 전용 API 호출. lat/lng 없이 전역 데이터에서 단건 조회합니다.
 * (`/api/stores` 에서 `short` 분기는 반경 필터 없음)
 */
export async function fetchStoreByShortCodeOnly(shortCode: string): Promise<FetchStoreByShortResult> {
  const requestUrl = `/api/stores?short=${encodeURIComponent(shortCode)}`;

  if (!isValidShortCode(shortCode)) {
    console.error(DEEPLINK_LOG_PREFIX, "invalid shortCode", shortCode);
    return { row: null, requestUrl, httpOk: false };
  }

  console.info(DEEPLINK_LOG_PREFIX, "fetchStoreByShortCodeOnly", { shortCode, requestUrl });

  let res: Response;
  try {
    res = await fetch(requestUrl);
  } catch (e) {
    console.error(DEEPLINK_LOG_PREFIX, "network error", requestUrl, e);
    return { row: null, requestUrl, httpOk: false };
  }

  if (!res.ok) {
    console.error(DEEPLINK_LOG_PREFIX, "API not ok", { requestUrl, status: res.status });
    return { row: null, requestUrl, httpOk: false, httpStatus: res.status };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    console.error(DEEPLINK_LOG_PREFIX, "JSON parse failed", requestUrl, e);
    return { row: null, requestUrl, httpOk: true, httpStatus: res.status };
  }

  const stores = (data as { stores?: StoreData[] }).stores;
  const row = stores?.[0] ?? null;

  console.info(DEEPLINK_LOG_PREFIX, "API result", {
    shortCode,
    hasRow: Boolean(row),
    storeId: row?.id
  });

  return { row, requestUrl, httpOk: true, httpStatus: res.status };
}
