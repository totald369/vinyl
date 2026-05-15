import { stableShortCodeFromSeed } from "@/lib/shortLink";

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
  /** 사용자/관리자 메시지. `[closed] ...` 접두로 폐업 제보 표현. */
  message?: string | null;
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

/**
 * edit_request + 메시지 `[closed]` 접두 → 폐업 신고로 간주.
 * (rejected 상태는 무시)
 */
function isClosedReport(row: RawReportRow): boolean {
  if (isRejected(row.status ?? undefined)) return false;
  if ((row.report_type ?? "") !== "edit_request") return false;
  const msg = (row.message ?? "").trim().toLowerCase();
  return msg.startsWith("[closed]");
}

function trimmedStoreId(row: RawReportRow): string | null {
  const sid = row.store_id;
  if (sid == null) return null;
  const t = String(sid).trim();
  return t === "" ? null : t;
}

/** 제보 행 → 기존 공공데이터 매장 id만 인증 처리 (폐업 제보는 제외) */
export function collectVerifiedStoreIdsFromReports(rows: RawReportRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isRejected(row.status ?? undefined)) continue;
    if (isClosedReport(row)) continue;
    const sid = trimmedStoreId(row);
    if (sid == null) continue;
    ids.add(sid);
  }
  return ids;
}

/** 폐업/판매 중단 제보 → 병합 결과에서 제외할 매장 id 집합 */
export function collectClosedStoreIdsFromReports(rows: RawReportRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isClosedReport(row)) continue;
    const sid = trimmedStoreId(row);
    if (sid == null) continue;
    ids.add(sid);
  }
  return ids;
}

export type ReportProductFlagUpdate = {
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
};

/**
 * edit_request(폐업 아님) 중 has_* 플래그를 OR-merge 로 반영할 매장 id → 플래그 맵.
 * 같은 매장 여러 제보가 있으면 true 가 한 번이라도 있으면 true.
 */
export function collectProductFlagUpdatesFromReports(
  rows: RawReportRow[]
): Map<string, ReportProductFlagUpdate> {
  const out = new Map<string, ReportProductFlagUpdate>();
  for (const row of rows) {
    if (isRejected(row.status ?? undefined)) continue;
    if ((row.report_type ?? "") !== "edit_request") continue;
    if (isClosedReport(row)) continue;
    const sid = trimmedStoreId(row);
    if (sid == null) continue;

    const next: ReportProductFlagUpdate = out.get(sid) ?? {
      hasTrashBag: false,
      hasSpecialBag: false,
      hasLargeWasteSticker: false
    };
    if (row.has_trash_bag === true) next.hasTrashBag = true;
    if (row.has_special_bag === true) next.hasSpecialBag = true;
    if (row.has_large_waste_sticker === true) next.hasLargeWasteSticker = true;
    out.set(sid, next);
  }
  return out;
}

/**
 * 신규 제보 매장(store_id 없음) → stores JSON과 동일 형태 행.
 * 위·경도가 없으면 제외(지오코딩 스크립트로 채운 뒤 반영).
 */
export function reportRowsToExtraRawStores(rows: RawReportRow[]): ReportStoreJsonRow[] {
  const out: ReportStoreJsonRow[] = [];
  for (const row of rows) {
    if (isRejected(row.status ?? undefined)) continue;
    if (isClosedReport(row)) continue;
    const sid = row.store_id;
    if (sid != null && String(sid).trim() !== "") continue;

    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const created = row.created_at?.trim() ?? "";
    const datePart = created.length >= 10 ? created.slice(0, 10) : undefined;

    const reportKey = `report:${row.id}`;
    out.push({
      id: reportKey,
      shortCode: stableShortCodeFromSeed(reportKey),
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
