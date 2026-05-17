import { DISTRICT_TRASHBAG_PAGES } from "@/lib/districtTrashbagSeo";

const DISTRICT_SLUGS = new Set(DISTRICT_TRASHBAG_PAGES.map((p) => p.slug));

/** 카카오 maps SDK·타일이 필요한 경로만 (그 외 페이지는 SDK 미로드 → TBT·전송량 절감) */
export function pathnameNeedsKakaoMap(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/regions")) return true;
  if (pathname === "/report" || pathname.startsWith("/report/")) return true;

  const segment = pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (DISTRICT_SLUGS.has(segment as (typeof DISTRICT_TRASHBAG_PAGES)[number]["slug"])) {
    return true;
  }

  return false;
}
