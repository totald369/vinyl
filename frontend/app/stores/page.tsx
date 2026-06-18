import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import StoreList from "@/components/StoreList";
import {
  DEFAULT_OG_IMAGE_ALT,
  SITE_BRAND_KO,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath,
  seoMetaDescriptionForPath
} from "@/lib/seoBrand";
import { mapStoreDataToStoreItem } from "@/lib/mapStoreDataToStoreItem";
import { getMergedStores } from "@/lib/server/storeDataset";
import { sliceStoresStableForSeo } from "@/lib/seoStoreSlice";

function storesListingCap(): number {
  const raw = process.env.STORE_LIST_PAGE_LIMIT;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(1200, Math.max(120, Math.floor(n)));
  }
  return 600;
}

const PAGE_PATH = "/stores";
const PAGE_TITLE = seoAbsoluteMetaTitleForPath(PAGE_PATH);
const PAGE_DESCRIPTION = seoMetaDescriptionForPath(PAGE_PATH);

export const metadata: Metadata = {
  alternates: { canonical: PAGE_PATH },
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_PATH,
    siteName: SITE_BRAND_KO,
    images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [defaultOpenGraphImage.url],
  },
};

/** 배포 단위 데이터 — 목록 페이지 ISR */
export const revalidate = 3600;

const getStoresListingPayload = unstable_cache(
  async () => {
    const merged = getMergedStores();
    const cap = storesListingCap();
    const slice = sliceStoresStableForSeo(merged, cap);
    return {
      mergedLength: merged.length,
      listStores: slice.map(mapStoreDataToStoreItem)
    };
  },
  ["stores-listing-page-v1"],
  { revalidate: 3600 }
);

export default async function StoresPage() {
  const { mergedLength, listStores } = await getStoresListingPayload();

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-8">
      <header className="pt-2">
        <h1 className="text-xl font-bold">판매처 목록</h1>
        <p className="text-sm text-slate-600">지도에서 확인한 판매처를 목록으로 볼 수 있어요.</p>
        <nav className="mt-2 text-sm text-slate-600" aria-label="관련 페이지">
          <Link href="/">{SITE_BRAND_KO} 홈</Link>
          {" · "}
          <Link href="/gangnam">강남 종량제 봉투 안내</Link>
        </nav>
        {mergedLength > listStores.length ? (
          <p className="mt-2 text-xs text-slate-500">
            매장 등록 {mergedLength.toLocaleString("ko-KR")}곳 중 id 기준 표시 허브 {listStores.length}
            곳까지 링크를 노출합니다. 그 외는 {SITE_BRAND_KO} 지도 검색과 지역별 페이지에서 확인하세요.
          </p>
        ) : null}
      </header>
      <StoreList contentState={listStores.length ? "ready" : "empty"} stores={listStores} />
      <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        {SITE_BRAND_KO}
      </footer>
    </main>
  );
}
