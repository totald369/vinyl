/** useStores `normalizeRow`에 넣을 수 있는 행 */
export type ReportStoreJsonRow = {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  roadAddress?: string;
  address?: string;
  businessStatus?: string;
  largeWasteStickerYn?: string;
  storeCategory?: string;
  adminVerified?: boolean;
  dataReferenceDate?: string;
  hasTrashBag?: boolean;
  hasSpecialBag?: boolean;
  hasLargeWasteSticker?: boolean;
} & Record<string, unknown>;

export type RawReportRow = {
  id: string;
  report_type?: string;
  store_id?: string | null;
  name?: string | null;
  road_address?: string | null;
  detail_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  has_trash_bag?: boolean | null;
  has_special_bag?: boolean | null;
  has_large_waste_sticker?: boolean | null;
  status?: string | null;
  created_at?: string | null;
};

function isRejected(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "rejected";
}

/** 관리자 승인된 제보만 판매 인증 배지(adminVerified) 대상 */
function isApproved(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "approved";
}

/** 제보 행 → 기존 공공데이터 매장 id만 인증 처리 */
export function collectVerifiedStoreIdsFromReports(rows: RawReportRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isRejected(row.status ?? undefined)) continue;
    const sid = row.store_id;
    if (sid == null || String(sid).trim() === "") continue;
    ids.add(String(sid).trim());
  }
  return ids;
}

/**
 * 신규 제보 매장(store_id 없음) → stores JSON과 동일 형태 행.
 * 위·경도가 없으면 제외(지오코딩 스크립트로 채운 뒤 반영).
 */
export function reportRowsToExtraRawStores(rows: RawReportRow[]): ReportStoreJsonRow[] {
  const out: ReportStoreJsonRow[] = [];
  for (const row of rows) {
    if (isRejected(row.status ?? undefined)) continue;
    const sid = row.store_id;
    if (sid != null && String(sid).trim() !== "") continue;

    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const created = row.created_at?.trim() ?? "";
    const datePart = created.length >= 10 ? created.slice(0, 10) : undefined;

    out.push({
      id: `report:${row.id}`,
      name: row.name ?? "",
      lat,
      lng,
      roadAddress: row.road_address?.trim() ?? "",
      address: row.detail_address?.trim() ?? "",
      hasTrashBag: row.has_trash_bag === true,
      hasSpecialBag: row.has_special_bag === true,
      hasLargeWasteSticker: row.has_large_waste_sticker === true,
      adminVerified: isApproved(row.status),
      dataReferenceDate: datePart
    });
  }
  return out;
}
