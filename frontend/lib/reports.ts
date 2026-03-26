export type ReportType = "new_store" | "edit_request";
export type ReportStatus = "pending" | "approved" | "rejected";

export type ReportPayload = {
  report_type: ReportType;
  store_id?: string | null;
  name?: string;
  road_address?: string;
  detail_address?: string;
  lat?: number | null;
  lng?: number | null;
  has_trash_bag?: boolean;
  has_special_bag?: boolean;
  has_large_waste_sticker?: boolean;
  message?: string;
};

export type ReportInsertRow = {
  report_type: ReportType;
  store_id: string | null;
  name: string;
  road_address: string;
  detail_address: string;
  lat: number | null;
  lng: number | null;
  has_trash_bag: boolean;
  has_special_bag: boolean;
  has_large_waste_sticker: boolean;
  message: string;
  status: ReportStatus;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const asNum = Number(value);
  return Number.isFinite(asNum) ? asNum : null;
}

export function validateAndNormalizeReport(payload: unknown): {
  ok: true;
  data: ReportInsertRow;
} | {
  ok: false;
  error: string;
} {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }

  const body = payload as Record<string, unknown>;
  const reportType = body.report_type;

  if (reportType !== "new_store" && reportType !== "edit_request") {
    return { ok: false, error: "report_type 값이 올바르지 않습니다." };
  }

  const storeId = normalizeString(body.store_id) || null;
  const name = normalizeString(body.name);
  const roadAddress = normalizeString(body.road_address);
  const detailAddress = normalizeString(body.detail_address);
  const message = normalizeString(body.message);
  const lat = normalizeNullableNumber(body.lat);
  const lng = normalizeNullableNumber(body.lng);

  const normalized: ReportInsertRow = {
    report_type: reportType,
    store_id: storeId,
    name,
    road_address: roadAddress,
    detail_address: detailAddress,
    lat,
    lng,
    has_trash_bag: normalizeBoolean(body.has_trash_bag),
    has_special_bag: normalizeBoolean(body.has_special_bag),
    has_large_waste_sticker: normalizeBoolean(body.has_large_waste_sticker),
    message,
    status: "pending"
  };

  if (reportType === "new_store") {
    if (!normalized.name) return { ok: false, error: "업체명을 입력해주세요." };
    if (!normalized.road_address) return { ok: false, error: "주소를 입력해주세요." };
    if (normalized.lat == null || normalized.lng == null) {
      return { ok: false, error: "위치 좌표가 올바르지 않습니다." };
    }
  }

  if (reportType === "edit_request") {
    if (!normalized.store_id) return { ok: false, error: "store_id를 입력해주세요." };
    if (!normalized.message) return { ok: false, error: "수정 요청 내용을 입력해주세요." };
    // 수정 요청은 매장 주소/좌표 없이도 접수 가능하도록 기본값 보정
    if (!normalized.name) normalized.name = `store:${normalized.store_id}`;
    if (!normalized.road_address) normalized.road_address = "";
  }

  return { ok: true, data: normalized };
}
