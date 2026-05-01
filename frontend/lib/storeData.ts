import {
  dedupeStoresByBizNameProximity,
  dedupeStoresByNameAndLocation
} from "@/lib/dedupeStores";
import { pickDataReferenceDateFromRow } from "@/lib/datasetDate";
import { ensureShortCodesOnStores, isValidShortCode } from "@/lib/shortLink";
import {
  collectVerifiedStoreIdsFromReports,
  reportRowsToExtraRawStores,
  type RawReportRow
} from "@/lib/reportStores";

/** 클라이언트·서버 공통: 원본 JSON 행 */
export type RawStoreRow = {
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
  /** 6-char share code from JSON (must be pre-assigned by scripts/assignShortCodes.ts) */
  shortCode?: string;
  /** 대표 전화번호(표시 가능한 경우만) */
  phone?: string;
} & Record<string, unknown>;

export type StoreData = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress?: string;
  address?: string;
  phone?: string;
  businessStatus?: string;
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
  adminVerified?: boolean;
  dataReferenceDate?: string;
  distance?: number;
  /** Present after mergeStoreSources / API (share link /s/[shortCode]) */
  shortCode?: string;
};

export function normalizeRow(raw: RawStoreRow): StoreData {
  const hasTrashBag =
    raw.hasTrashBag === true || raw.storeCategory === "payBag";
  const hasSpecialBag =
    raw.hasSpecialBag === true || raw.storeCategory === "nonBurnable";
  const hasLargeWasteSticker =
    raw.hasLargeWasteSticker === true || raw.largeWasteStickerYn === "Y";

  const fromJson =
    typeof raw.dataReferenceDate === "string" && raw.dataReferenceDate.trim()
      ? raw.dataReferenceDate.trim()
      : "";

  const sc =
    typeof raw.shortCode === "string" && isValidShortCode(raw.shortCode.trim())
      ? raw.shortCode.trim()
      : undefined;

  const phoneTrim =
    typeof raw.phone === "string" ? raw.phone.trim() : "";

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    roadAddress: raw.roadAddress ?? raw.address ?? "",
    address: raw.address ?? "",
    businessStatus: raw.businessStatus,
    hasTrashBag,
    hasSpecialBag,
    hasLargeWasteSticker,
    adminVerified: raw.adminVerified === true,
    dataReferenceDate: fromJson || pickDataReferenceDateFromRow(raw),
    ...(sc ? { shortCode: sc } : {}),
    ...(phoneTrim ? { phone: phoneTrim } : {})
  };
}

/**
 * 여러 JSON 소스 + 제보 행을 병합·중복 제거해 StoreData 배열로 만듭니다.
 * (기존 useStores 클라이언트 로직과 동일)
 */
export function mergeStoreSources(
  mainRows: RawStoreRow[],
  gunpoRows: RawStoreRow[],
  goyangRows: RawStoreRow[],
  goyangStickerRows: RawStoreRow[],
  reportRows: RawReportRow[],
  guroNoncombustRows: RawStoreRow[],
  gwanakNoncombustRows: RawStoreRow[],
  busanNamguTrashRows: RawStoreRow[],
  busanJungguTrashRows: RawStoreRow[],
  busanJungguPpRows: RawStoreRow[],
  busanDongguTrashRows: RawStoreRow[],
  busanDongnaeTrashRows: RawStoreRow[],
  busanGeumjeongTrashRows: RawStoreRow[],
  busanGeumjeongSpecialRows: RawStoreRow[],
  busanBukguTrashRows: RawStoreRow[],
  busanBukguSpecialRows: RawStoreRow[],
  busanSasangTrashRows: RawStoreRow[],
  busanSasangSpecialRows: RawStoreRow[],
  busanHaeundaeTrashRows: RawStoreRow[],
  busanYeongdoTrashRows: RawStoreRow[]
): StoreData[] {
  const verifiedIds = collectVerifiedStoreIdsFromReports(reportRows);
  const extraRaw = reportRowsToExtraRawStores(reportRows);

  const normalizedMain = [
    ...mainRows,
    ...gunpoRows,
    ...goyangRows,
    ...goyangStickerRows,
    ...guroNoncombustRows,
    ...gwanakNoncombustRows,
    ...busanNamguTrashRows,
    ...busanJungguTrashRows,
    ...busanJungguPpRows,
    ...busanDongguTrashRows,
    ...busanDongnaeTrashRows,
    ...busanGeumjeongTrashRows,
    ...busanGeumjeongSpecialRows,
    ...busanBukguTrashRows,
    ...busanBukguSpecialRows,
    ...busanSasangTrashRows,
    ...busanSasangSpecialRows,
    ...busanHaeundaeTrashRows,
    ...busanYeongdoTrashRows
  ]
    .map(normalizeRow)
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
    .map((row) => ({
      ...row,
      adminVerified: !!(row.adminVerified || verifiedIds.has(row.id))
    }));

  const normalizedExtra = extraRaw
    .map((raw) => normalizeRow(raw as RawStoreRow))
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));

  const merged = dedupeStoresByBizNameProximity(
    dedupeStoresByNameAndLocation([...normalizedMain, ...normalizedExtra])
  );
  return ensureShortCodesOnStores(merged);
}
