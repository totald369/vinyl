import type { RegionSeoCategory } from "@/lib/regionPageMetadata";
import { regionCategoryKo } from "@/lib/regionPageMetadata";
import { SITE_URL } from "@/lib/site";

/** 공유 URL query — SEO canonical 과 분리된 UX 전용 파라미터 */
export type RegionShareType = "trash-bag" | "incombustible-bag" | "large-waste-sticker";

export function regionShareTypeFromCategory(category: RegionSeoCategory): RegionShareType {
  switch (category) {
    case "nonBurnable":
      return "incombustible-bag";
    case "largeSticker":
      return "large-waste-sticker";
    default:
      return "trash-bag";
  }
}

export function regionCategoryFromShareType(
  raw: string | null | undefined
): RegionSeoCategory | null {
  const t = raw?.trim();
  if (t === "incombustible-bag" || t === "nonBurnable") return "nonBurnable";
  if (t === "large-waste-sticker" || t === "largeSticker") return "largeSticker";
  if (t === "trash-bag" || t === "payBag") return "payBag";
  return null;
}

export function parseRegionCategoryFromSearchParams(searchParams: {
  get(name: string): string | null;
}): RegionSeoCategory {
  const fromShareType = regionCategoryFromShareType(searchParams.get("type"));
  if (fromShareType) return fromShareType;
  const filter = searchParams.get("filter")?.trim();
  if (filter === "nonBurnable" || filter === "largeSticker") return filter;
  return "payBag";
}

export type RegionShareCopy = {
  title: string;
  description: string;
  productLabel: string;
  productType: RegionShareType;
  sheetDescription: string;
  clipboardText: string;
};

export function buildRegionSharePath(slugSegments: string[], category: RegionSeoCategory): string {
  const path = `/regions/${slugSegments.map((s) => encodeURIComponent(s)).join("/")}`;
  const qs = new URLSearchParams();
  qs.set("type", regionShareTypeFromCategory(category));
  return `${path}?${qs.toString()}`;
}

export function buildRegionShareUrl(slugSegments: string[], category: RegionSeoCategory): string {
  return `${SITE_URL}${buildRegionSharePath(slugSegments, category)}`;
}

export function getRegionShareCopy(
  regionName: string,
  category: RegionSeoCategory,
  shareUrl: string
): RegionShareCopy {
  const productLabel = regionCategoryKo(category);
  const productType = regionShareTypeFromCategory(category);

  const title = `${regionName} ${productLabel} 판매처`;

  let description: string;
  switch (category) {
    case "nonBurnable":
      description = "불연성마대 판매처와 위치를 쓰봉맵에서 확인해보세요.";
      break;
    case "largeSticker":
      description = "대형폐기물스티커 판매처를 지도와 목록으로 확인해보세요.";
      break;
    default:
      description = "가까운 종량제봉투 판매처를 쓰봉맵에서 확인해보세요.";
      break;
  }

  const sheetDescription = `${regionName} ${productLabel} 판매처를 공유할 수 있어요.`;

  return {
    title,
    description,
    productLabel,
    productType,
    sheetDescription,
    clipboardText: `${regionName} ${productLabel} 판매처를 쓰봉맵에서 확인해보세요.\n${shareUrl}`
  };
}
