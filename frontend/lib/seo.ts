import type { Metadata } from "next";

import { normalizeProvinceAbbrevForDisplay } from "@/lib/koreaProvinceAliases";
import {
  DEFAULT_OG_IMAGE_ALT,
  defaultOpenGraphImage,
  SITE_BRAND_KO
} from "@/lib/seoBrand";
import { SITE_URL } from "@/lib/site";
import type { StoreData } from "@/lib/storeData";

const BRAND_SUFFIX = ` | ${SITE_BRAND_KO}`;
const PREFERRED_TITLE_MAX = 34;
const DEFAULT_TITLE_MAX = 60;
const DEFAULT_DESC_MIN = 70;
const DEFAULT_DESC_MAX = 100;

export type StoreProductKey = "trashBag" | "specialBag" | "largeWasteSticker";

export type StoreProduct = {
  key: StoreProductKey;
  label: string;
};

export type StoreProductSource = {
  name?: string;
  roadAddress?: string;
  address?: string;
  phone?: string;
  hasTrashBag?: unknown;
  hasSpecialBag?: unknown;
  hasLargeWasteSticker?: unknown;
  storeCategory?: string;
  largeWasteStickerYn?: unknown;
};

export type RegionProductSummary = {
  products: StoreProduct[];
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
};

const TITLE_PRODUCT_LABELS: Record<StoreProductKey, string> = {
  trashBag: "종량제봉투",
  specialBag: "불연성마대",
  largeWasteSticker: "폐기물스티커"
};

const DESC_PRODUCT_LABELS: Record<StoreProductKey, string> = {
  trashBag: "종량제봉투",
  specialBag: "불연성마대",
  largeWasteSticker: "대형폐기물 스티커"
};

const SALE_YES = new Set(["y", "yes", "true", "1", "o", "판매", "가능", "있음"]);
const SALE_NO = new Set(["n", "no", "false", "0", "x", "미판매", "불가", "없음"]);

const HOME_TITLE = `종량제봉투 판매처 지도${BRAND_SUFFIX}`;
const HOME_DESCRIPTION =
  "우리 동네 종량제봉투, 불연성마대, 대형폐기물 스티커 판매처를 지도에서 확인하세요. 주소, 판매 품목, 길찾기 정보를 제공합니다.";
const HOME_OG_TWITTER_DESCRIPTION =
  "종량제봉투, 불연성마대, 대형폐기물 스티커 판매처를 지역과 업체명으로 검색해보세요.";

/** SEO용 공백·제어문자 정리 */
export function cleanSeoText(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRegionName(region: string): string {
  return cleanSeoText(region);
}

export function normalizeDistrictName(district: string): string {
  return cleanSeoText(district);
}

/** 판매 여부 값을 boolean으로 안전 변환. 알 수 없으면 null */
export function normalizeSaleValue(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (SALE_YES.has(s)) return true;
  if (SALE_NO.has(s)) return false;
  return null;
}

function isProductSold(fieldValue: unknown, categoryFallback = false): boolean {
  const normalized = normalizeSaleValue(fieldValue);
  if (normalized === true) return true;
  if (normalized === false) return false;
  return categoryFallback;
}

/** true인 판매 품목만 반환 */
export function getStoreProducts(store: StoreProductSource): StoreProduct[] {
  const products: StoreProduct[] = [];

  if (isProductSold(store.hasTrashBag, store.storeCategory === "payBag")) {
    products.push({ key: "trashBag", label: DESC_PRODUCT_LABELS.trashBag });
  }
  if (isProductSold(store.hasSpecialBag, store.storeCategory === "nonBurnable")) {
    products.push({ key: "specialBag", label: DESC_PRODUCT_LABELS.specialBag });
  }
  if (
    isProductSold(
      store.hasLargeWasteSticker,
      normalizeSaleValue(store.largeWasteStickerYn) === true
    )
  ) {
    products.push({
      key: "largeWasteSticker",
      label: DESC_PRODUCT_LABELS.largeWasteSticker
    });
  }

  return products;
}

/** 지역 stores 배열에서 실제 취급 품목 집계 */
export function getRegionProductSummary(stores: StoreProductSource[]): RegionProductSummary {
  let hasTrashBag = false;
  let hasSpecialBag = false;
  let hasLargeWasteSticker = false;

  for (const store of stores) {
    for (const product of getStoreProducts(store)) {
      if (product.key === "trashBag") hasTrashBag = true;
      if (product.key === "specialBag") hasSpecialBag = true;
      if (product.key === "largeWasteSticker") hasLargeWasteSticker = true;
    }
  }

  const products: StoreProduct[] = [];
  if (hasTrashBag) products.push({ key: "trashBag", label: DESC_PRODUCT_LABELS.trashBag });
  if (hasSpecialBag) products.push({ key: "specialBag", label: DESC_PRODUCT_LABELS.specialBag });
  if (hasLargeWasteSticker) {
    products.push({
      key: "largeWasteSticker",
      label: DESC_PRODUCT_LABELS.largeWasteSticker
    });
  }

  return { products, hasTrashBag, hasSpecialBag, hasLargeWasteSticker };
}

/** description용 품목 목록 연결 */
export function joinProductNames(products: StoreProduct[]): string {
  if (products.length === 0) return "";
  if (products.length === 1) return products[0]!.label;
  if (products.length === 2) return `${products[0]!.label}와 ${products[1]!.label}`;
  return `${products[0]!.label}, ${products[1]!.label}, ${products[2]!.label}`;
}

function pickTitleCandidate(candidates: string[]): string {
  const unique = [...new Set(candidates.filter(Boolean))];
  const preferred = unique.find((c) => c.length <= PREFERRED_TITLE_MAX);
  if (preferred) return preferred;
  const fallback = unique.find((c) => c.length <= DEFAULT_TITLE_MAX);
  if (fallback) return fallback;
  return truncateSeoTitle(unique[0] ?? "", DEFAULT_TITLE_MAX);
}

function withBrandVariants(core: string): string[] {
  const base = cleanSeoText(core);
  return [base.endsWith(BRAND_SUFFIX) ? base : `${base}${BRAND_SUFFIX}`, base];
}

function regionTitleSegment(
  summary: RegionProductSummary,
  opts?: { districtLevel?: boolean }
): string {
  const { hasTrashBag, hasSpecialBag, hasLargeWasteSticker } = summary;
  const count = [hasTrashBag, hasSpecialBag, hasLargeWasteSticker].filter(Boolean).length;

  if (count === 0) return "종량제봉투 판매처";
  if (count === 3) return "생활폐기물 판매처";
  if (hasTrashBag && hasSpecialBag) return "종량제봉투·불연성마대 판매처";
  if (hasTrashBag && hasLargeWasteSticker) return "종량제봉투·폐기물스티커 판매처";
  if (opts?.districtLevel && !hasTrashBag && hasSpecialBag) return "불연성마대 판매처";
  if (hasTrashBag) return "종량제봉투 판매처";
  if (hasSpecialBag && hasLargeWasteSticker) return "불연성마대·폐기물스티커 판매처";
  if (hasSpecialBag) return "불연성마대 판매처";
  if (hasLargeWasteSticker) return "폐기물스티커 판매처";
  return "종량제봉투 판매처";
}

function buildAreaSeoTitle(
  areaName: string,
  summary: RegionProductSummary,
  opts?: { districtLevel?: boolean }
): string {
  const name = normalizeRegionName(areaName);
  const segment = regionTitleSegment(summary, opts);
  const candidates = [
    ...withBrandVariants(`${name} ${segment}`),
    ...withBrandVariants(`${name} 생활폐기물 판매처`),
    ...withBrandVariants(`${name} 종량제봉투 판매처`),
    ...withBrandVariants(`${name} 판매처 지도`)
  ];
  return pickTitleCandidate(candidates);
}

function buildAreaSeoDescription(
  areaName: string,
  summary: RegionProductSummary,
  storeCount: number,
  opts?: { districtLevel?: boolean }
): string {
  const name = normalizeRegionName(areaName);
  const productList = joinProductNames(summary.products);

  let description: string;

  if (summary.products.length === 0 || storeCount === 0) {
    description = `${name} 종량제봉투 판매처를 지도에서 확인하세요. 주소, 판매 품목, 길찾기 정보를 제공합니다.`;
  } else {
    const simpleLine = opts?.districtLevel
      ? `${name}에서 ${productList} 판매처를 확인하세요. 가까운 판매점의 주소, 판매 품목, 길찾기 정보를 제공합니다.`
      : `${name}에서 ${productList} 판매처를 확인하세요. 주소와 길찾기 정보를 제공합니다.`;
    const countLine = `${name}의 ${storeCount}개 판매처에서 ${productList} 판매 여부를 확인하세요. 주소와 길찾기 정보를 제공합니다.`;

    const trimmedCount = truncateDescription(countLine, DEFAULT_DESC_MIN, DEFAULT_DESC_MAX);
    description =
      trimmedCount.length <= DEFAULT_DESC_MAX && countLine.length <= DEFAULT_DESC_MAX
        ? trimmedCount
        : truncateDescription(simpleLine, DEFAULT_DESC_MIN, DEFAULT_DESC_MAX);
  }

  return truncateDescription(description, DEFAULT_DESC_MIN, DEFAULT_DESC_MAX);
}

export function buildRegionSeoTitle(areaName: string, stores: StoreProductSource[]): string {
  return buildAreaSeoTitle(areaName, getRegionProductSummary(stores));
}

export function buildRegionSeoDescription(
  areaName: string,
  stores: StoreProductSource[]
): string {
  return buildAreaSeoDescription(areaName, getRegionProductSummary(stores), stores.length);
}

export function buildDistrictSeoTitle(districtName: string, stores: StoreProductSource[]): string {
  return buildAreaSeoTitle(districtName, getRegionProductSummary(stores), { districtLevel: true });
}

export function buildDistrictSeoDescription(
  districtName: string,
  stores: StoreProductSource[]
): string {
  return buildAreaSeoDescription(
    districtName,
    getRegionProductSummary(stores),
    stores.length,
    { districtLevel: true }
  );
}

function titleProductSegment(products: StoreProduct[]): string {
  if (products.length === 0) return "종량제봉투 판매 정보";
  if (products.length === 1) {
    return `${TITLE_PRODUCT_LABELS[products[0]!.key]} 판매 정보`;
  }
  if (products.length === 2) {
    const labels = products.map((p) => TITLE_PRODUCT_LABELS[p.key]);
    return `${labels.join("·")} 판매처`;
  }
  return "생활폐기물 판매처";
}

export function truncateSeoTitle(text: string, maxLength = DEFAULT_TITLE_MAX): string {
  const cleaned = cleanSeoText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function truncateDescription(
  text: string,
  minLength = DEFAULT_DESC_MIN,
  maxLength = DEFAULT_DESC_MAX
): string {
  const cleaned = cleanSeoText(text);
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const sentenceEnd = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("。"));
  if (sentenceEnd >= minLength) return slice.slice(0, sentenceEnd + 1);

  const wordEnd = slice.lastIndexOf(" ");
  if (wordEnd >= minLength) return `${slice.slice(0, wordEnd).trimEnd()}.`;

  return truncateSeoTitle(cleaned, maxLength);
}

export function buildStoreSeoTitle(store: StoreProductSource): string {
  const name = cleanSeoText(store.name ?? "");
  const products = getStoreProducts(store);

  const candidates: string[] = [];

  if (products.length === 0) {
    candidates.push(...withBrandVariants(`${name} 종량제봉투 판매 정보`));
  } else if (products.length >= 3) {
    candidates.push(...withBrandVariants(`${name} 생활폐기물 판매처`));
    const labels = products.map((p) => TITLE_PRODUCT_LABELS[p.key]);
    candidates.push(...withBrandVariants(`${name} ${labels.join("·")} 판매처`));
  } else {
    candidates.push(...withBrandVariants(`${name} ${titleProductSegment(products)}`));
    if (products.length === 2) {
      const one = products.slice(0, 1);
      candidates.push(...withBrandVariants(`${name} ${titleProductSegment(one)}`));
    }
  }

  candidates.push(...withBrandVariants(`${name} 종량제봉투 판매 정보`));
  return pickTitleCandidate(candidates);
}

function getStoreAddressLine(store: StoreProductSource): string {
  const raw = (store.roadAddress?.trim() || store.address?.trim() || "").trim();
  return raw ? normalizeProvinceAbbrevForDisplay(raw) : "";
}

function summarizeAddressForSeo(address: string): string {
  const cleaned = cleanSeoText(address);
  if (!cleaned) return "";
  if (cleaned.length <= 24) return cleaned;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const picked: string[] = [];

  for (const token of tokens) {
    picked.push(token);
    if (/(특별시|광역시|특별자치시|특별자치도|도)$/.test(token)) continue;
    if (/(시|군|구)$/.test(token)) break;
  }

  const summary = picked.join(" ").trim();
  return summary || cleaned.slice(0, 24).trim();
}

export function buildStoreSeoDescription(store: StoreProductSource): string {
  const name = cleanSeoText(store.name ?? "");
  const products = getStoreProducts(store);
  const productList = joinProductNames(products);
  const addressLine = getStoreAddressLine(store);
  const addressSummary = summarizeAddressForSeo(addressLine);
  const hasPhone = Boolean(store.phone?.trim());

  let description: string;

  if (products.length === 0) {
    description = `${name}의 종량제봉투 판매 정보를 확인하세요. 주소와 길찾기 정보를 제공하며 방문 전 판매 여부 확인을 권장합니다.`;
  } else if (hasPhone) {
    description = `${name}에서 ${productList} 판매 여부를 확인하세요. 주소, 전화번호, 길찾기 정보를 제공하며 방문 전 확인을 권장합니다.`;
  } else if (addressSummary) {
    description = `${name}은 ${addressSummary}에 있는 판매처입니다. ${productList} 판매 여부와 길찾기 정보를 확인하세요.`;
  } else {
    description = `${name}에서 ${productList} 판매 여부를 확인하세요. 주소와 길찾기 정보를 제공하며 방문 전 확인을 권장합니다.`;
  }

  return truncateDescription(description, DEFAULT_DESC_MIN, DEFAULT_DESC_MAX);
}

/** 절대 canonical URL (trailing slash 없음) */
export function buildCanonical(path: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

type PageMetadataOpts = {
  title: string;
  description: string;
  path: string;
  openGraphDescription?: string;
  openGraphType?: "website" | "article";
};

function assemblePageMetadata(opts: PageMetadataOpts): Metadata {
  const canonical = buildCanonical(opts.path);
  const ogDescription = opts.openGraphDescription ?? opts.description;

  return {
    alternates: { canonical },
    title: { absolute: opts.title },
    description: opts.description,
    robots: { index: true, follow: true },
    openGraph: {
      title: opts.title,
      description: ogDescription,
      url: canonical,
      siteName: SITE_BRAND_KO,
      locale: "ko_KR",
      type: opts.openGraphType ?? "website",
      images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }]
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.openGraphDescription ?? opts.description,
      images: [defaultOpenGraphImage.url]
    }
  };
}

export function buildHomeMetadata(): Metadata {
  return assemblePageMetadata({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: "/",
    openGraphDescription: HOME_OG_TWITTER_DESCRIPTION
  });
}

export function buildRegionMetadata(
  regionName: string,
  stores: StoreProductSource[],
  opts: { path: string }
): Metadata {
  return assemblePageMetadata({
    title: buildRegionSeoTitle(regionName, stores),
    description: buildRegionSeoDescription(regionName, stores),
    path: opts.path,
    openGraphType: "website"
  });
}

export function buildDistrictMetadata(
  _regionName: string,
  districtName: string,
  stores: StoreProductSource[],
  opts: { path: string }
): Metadata {
  const label = normalizeDistrictName(districtName);
  return assemblePageMetadata({
    title: buildDistrictSeoTitle(label, stores),
    description: buildDistrictSeoDescription(label, stores),
    path: opts.path,
    openGraphType: "website"
  });
}

export function buildStoreMetadata(
  store: StoreData,
  opts: { path: string }
): Metadata {
  return assemblePageMetadata({
    title: buildStoreSeoTitle(store),
    description: buildStoreSeoDescription(store),
    path: opts.path,
    openGraphType: "article"
  });
}
