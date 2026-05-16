/**
 * /api/stores 응답·정렬용 공유 헬퍼.
 *
 * 변경 전: route.ts 안에 inline 으로만 존재 → SSR (app/regions/[...slug]/page.tsx) 가
 *          같은 shape 데이터를 직접 빌드하려면 코드를 복제해야 했음.
 * 변경 후: shape/필터 헬퍼를 server-only 단일 모듈로 분리해 route.ts 와 regionPayload.ts 가 공유.
 *          - 응답 형태(toListStore) 가 한 곳에서만 정의되어 SSR/CSR 간 drift 방지
 *          - storeRowNeedsDetailFetch 가 항상 false (dataReferenceDate/businessStatus 포함)
 */
import type { StoreData } from "@/lib/storeData";

export type ProductFilter = "payBag" | "nonBurnable" | "largeSticker";

export function parseProductFilterValue(raw: string | null | undefined): ProductFilter {
  const f = (raw ?? "").trim();
  if (f === "nonBurnable" || f === "largeSticker") return f;
  return "payBag";
}

export function matchesProductFilter(s: StoreData, filter: ProductFilter): boolean {
  if (filter === "nonBurnable") return s.hasSpecialBag;
  if (filter === "largeSticker") return s.hasLargeWasteSticker;
  return s.hasTrashBag;
}

export function roundCoord6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * list/region/search 응답 row.
 *
 * dataReferenceDate / businessStatus 가 포함되어 클라이언트의 useStoreDetailAugment 가
 * detail 보강 fetch 를 건너뛰도록 한다 (storeRowNeedsDetailFetch === false).
 * 페이로드 증가: 30행 기준 ~1KB 미만 (brotli 후 거의 무의미).
 */
export function toListStore(s: StoreData, distanceKm?: number) {
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
    dataReferenceDate: s.dataReferenceDate ?? "",
    businessStatus: s.businessStatus ?? "",
    ...(phone ? { phone } : {}),
    ...(distanceKm != null ? { distance: distanceKm } : {})
  };
}

export type ListStoreShape = ReturnType<typeof toListStore>;
