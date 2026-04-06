import {
  dedupeStoresByBizNameProximity,
  dedupeStoresByNameAndLocation
} from "@/lib/dedupeStores";
import { pickDataReferenceDateFromRow } from "@/lib/datasetDate";
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
} & Record<string, unknown>;

export type StoreData = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress?: string;
  address?: string;
  businessStatus?: string;
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
  adminVerified?: boolean;
  dataReferenceDate?: string;
  distance?: number;
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
    dataReferenceDate: fromJson || pickDataReferenceDateFromRow(raw)
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
  reportRows: RawReportRow[]
): StoreData[] {
  const verifiedIds = collectVerifiedStoreIdsFromReports(reportRows);
  const extraRaw = reportRowsToExtraRawStores(reportRows);

  const normalizedMain = [
    ...mainRows,
    ...gunpoRows,
    ...goyangRows,
    ...goyangStickerRows
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

  return dedupeStoresByBizNameProximity(
    dedupeStoresByNameAndLocation([...normalizedMain, ...normalizedExtra])
  );
}
