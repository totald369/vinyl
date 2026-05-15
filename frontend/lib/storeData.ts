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

const CANONICAL_CU_BRAND = "씨유(CU)";

/**
 * CU 편의점 업체명을 항상 `씨유(CU) 지점명` 형태로 맞춤.
 * 신규 JSON·제보 데이터는 `CU …`, `씨유 …`, `씨유(CU) …` 등 아무 형태로 넣어도 merge 시 동일하게 표시됨.
 * (씨유 + 한글을 붙여 쓰는 일반 명칭은 건드리지 않음 — 앞에 공백이 있어야 `씨유` 접두로 인정)
 */
export function normalizeCuBrandDisplayName(name: string): string {
  const s = name.trim();
  if (!s) return s;

  const withCanonicalRest = (rest: string) => {
    const t = rest.trim();
    return t ? `${CANONICAL_CU_BRAND} ${t}` : CANONICAL_CU_BRAND;
  };

  // 이미 (cu) 괄호 형태 — 공백만 표준화
  let m = s.match(/^\s*씨유\s*\(\s*CU\s*\)\s*(.*)$/i);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  // 씨유 + (기타괄호)? + 공백 + 지점명  —  "씨유 강남점", "씨유(구) 강남점" 등
  m = s.match(/^\s*씨유(?:\s*\([^)]*\))?\s+(.+)$/u);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  // 씨유만 / 씨유(…)만
  if (/^\s*씨유(?:\s*\([^)]*\))?\s*$/u.test(s)) {
    return CANONICAL_CU_BRAND;
  }

  // 씨유 + 글자 직결(공백 없음) — 예: 씨유충주동산점 → 씨유(CU) 충주동산점
  m = s.match(/^\s*씨유([가-힣0-9].*)$/u);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  // CU + 공백 + 지점명
  m = s.match(/^\s*CU\s+(.+)$/i);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  // CU + 한글/숫자 (공백 없음) — 예: CU강남푸르지오점
  m = s.match(/^\s*CU([가-힣0-9].*)$/i);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  if (/^\s*CU\s*$/i.test(s)) {
    return CANONICAL_CU_BRAND;
  }

  return s;
}

const CANONICAL_GS25_BRAND = "지에스(GS)25";

/**
 * GS25 편의점 업체명을 항상 `지에스(GS)25 지점명` 형태로 맞춤.
 * `GS25 …`, `gs25 …`, `지에스25 …`, `지에스 25 …`, `GS 25 …` 등 수용.
 */
export function normalizeGs25BrandDisplayName(name: string): string {
  const s = name.trim();
  if (!s) return s;

  const withCanonicalRest = (rest: string) => {
    const t = rest.trim();
    return t ? `${CANONICAL_GS25_BRAND} ${t}` : CANONICAL_GS25_BRAND;
  };

  let m = s.match(/^\s*지에스\s*\(\s*GS\s*\)\s*25\s*(.*)$/i);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  m = s.match(/^\s*GS\s+25\s+(.+)$/i);
  if (m) return withCanonicalRest(m[1] ?? "");

  if (/^\s*GS\s+25\s*$/i.test(s)) return CANONICAL_GS25_BRAND;

  m = s.match(/^\s*지에스\s+25\s+(.+)$/iu);
  if (m) return withCanonicalRest(m[1] ?? "");

  if (/^\s*지에스\s+25\s*$/iu.test(s)) return CANONICAL_GS25_BRAND;

  // 지에스25... 공백·직결 나머지 — 예: 지에스25 역삼, 지에스25강남
  m = s.match(/^\s*지에스25\s*(.+)$/iu);
  if (m?.[1] != null) {
    const r = String(m[1]).trim();
    return r ? withCanonicalRest(r) : CANONICAL_GS25_BRAND;
  }
  if (/^\s*지에스25\s*$/iu.test(s)) return CANONICAL_GS25_BRAND;

  m = s.match(/^\s*GS25\s+(.+)$/i);
  if (m) return withCanonicalRest(m[1] ?? "");

  m = s.match(/^\s*GS25([가-힣0-9].*)$/i);
  if (m) return withCanonicalRest(m[1] ?? "");

  if (/^\s*GS25\s*$/i.test(s)) return CANONICAL_GS25_BRAND;

  return s;
}

const CANONICAL_EMART_BRAND = "이마트(e-mart)";

/**
 * 이마트 매장 업체명을 `이마트(e-mart) 지점명` 형태로 맞춤.
 * `emart`, `e-mart`, `E-MART`, `e마트`, `이마트 …` 등 수용.
 */
export function normalizeEmartBrandDisplayName(name: string): string {
  const s = name.trim();
  if (!s) return s;

  const withCanonicalRest = (rest: string) => {
    const t = rest.trim();
    return t ? `${CANONICAL_EMART_BRAND} ${t}` : CANONICAL_EMART_BRAND;
  };

  let m = s.match(/^\s*이마트\s*\(\s*e-mart\s*\)\s*(.*)$/i);
  if (m) {
    return withCanonicalRest(m[1] ?? "");
  }

  // e-mart, emart — 하이픈·대소문자 변형 (괄호 안 표기만 e-mart 고정)
  m = s.match(/^\s*e[\s_-]*mart\s*(.+)$/i);
  if (m) return withCanonicalRest(m[1] ?? "");
  if (/^\s*e[\s_-]*mart\s*$/i.test(s)) return CANONICAL_EMART_BRAND;

  m = s.match(/^\s*e\s*마트\s*(.+)$/iu);
  if (m) return withCanonicalRest(m[1] ?? "");
  if (/^\s*e\s*마트\s*$/iu.test(s)) return CANONICAL_EMART_BRAND;

  m = s.match(/^\s*이마트\s*\([^)]*\)\s+(.+)$/u);
  if (m) return withCanonicalRest(m[1] ?? "");

  if (/^\s*이마트\s*\([^)]*\)\s*$/u.test(s)) return CANONICAL_EMART_BRAND;

  m = s.match(/^\s*이마트\s+(.+)$/u);
  if (m) return withCanonicalRest(m[1] ?? "");

  if (/^\s*이마트\s*$/u.test(s)) return CANONICAL_EMART_BRAND;

  m = s.match(/^\s*이마트([가-힣0-9].*)$/u);
  if (m) return withCanonicalRest(m[1] ?? "");

  return s;
}

/** 업체명 브랜드 표기 통일 — merge 시점에 적용되어 API·목록 표시까지 일관. */
export function normalizeChainStoreDisplayNames(name: string): string {
  let n = normalizeCuBrandDisplayName(name.trim());
  n = normalizeGs25BrandDisplayName(n);
  n = normalizeEmartBrandDisplayName(n);
  return n;
}

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

  const rawName = String(raw.name ?? "").trim();

  return {
    id: String(raw.id ?? ""),
    name: normalizeChainStoreDisplayNames(rawName),
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
  dobongNoncombustRows: RawStoreRow[],
  bucheonGbmsRows: RawStoreRow[],
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
  busanYeongdoTrashRows: RawStoreRow[],
  gyeonggiGwangjuFindstoreRows: RawStoreRow[],
  gwangjuTrashLifeinsightsRows: RawStoreRow[],
  daeguBukDalTrashRows: RawStoreRow[],
  incheonMichuholTrashRows: RawStoreRow[],
  incheonYeonsuTrashStickerRows: RawStoreRow[],
  incheonNamdongTrashRows: RawStoreRow[],
  incheonBupyeongTrashStickerSpecialRows: RawStoreRow[],
  incheonGyeyangGbmsRows: RawStoreRow[],
  gyeonggiSiheungTrashRows: RawStoreRow[],
  daejeonDongguTrashRows: RawStoreRow[],
  daejeonYuseongTrashRows: RawStoreRow[],
  daejeonDaedeokTrashRows: RawStoreRow[],
  gangwonWonjuTrashRows: RawStoreRow[],
  gangwonTaebaekTrashRows: RawStoreRow[],
  ulsanDongguTrashRows: RawStoreRow[],
  ulsanBukguTrashRows: RawStoreRow[],
  ulsanBukguSpecialRows: RawStoreRow[],
  ulsanJungguTrashRows: RawStoreRow[],
  ulsanJungguSpecialRows: RawStoreRow[],
  chungbukChungjuTrashRows: RawStoreRow[],
  chungnamTrashRows: RawStoreRow[],
  chungnamGongjuTrashRows: RawStoreRow[],
  chungnamGongjuSpecialRows: RawStoreRow[],
  chungbukCheongjuTrashRows: RawStoreRow[],
  chungbukJeungpyeongTrashRows: RawStoreRow[]
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
    ...dobongNoncombustRows,
    ...bucheonGbmsRows,
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
    ...busanYeongdoTrashRows,
    ...gyeonggiGwangjuFindstoreRows,
    ...gwangjuTrashLifeinsightsRows,
    ...daeguBukDalTrashRows,
    ...incheonMichuholTrashRows,
    ...incheonYeonsuTrashStickerRows,
    ...incheonNamdongTrashRows,
    ...incheonBupyeongTrashStickerSpecialRows,
    ...incheonGyeyangGbmsRows,
    ...gyeonggiSiheungTrashRows,
    ...daejeonDongguTrashRows,
    ...daejeonYuseongTrashRows,
    ...daejeonDaedeokTrashRows,
    ...gangwonWonjuTrashRows,
    ...gangwonTaebaekTrashRows,
    ...ulsanDongguTrashRows,
    ...ulsanBukguTrashRows,
    ...ulsanBukguSpecialRows,
    ...ulsanJungguTrashRows,
    ...ulsanJungguSpecialRows,
    ...chungbukChungjuTrashRows,
    ...chungnamTrashRows,
    ...chungnamGongjuTrashRows,
    ...chungnamGongjuSpecialRows,
    ...chungbukCheongjuTrashRows,
    ...chungbukJeungpyeongTrashRows
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
