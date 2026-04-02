import Link from "next/link";
import type { Metadata } from "next";
import StoreList from "@/components/StoreList";
import { mockStores } from "@/lib/mock";
import {
  DEFAULT_OG_IMAGE_ALT,
  SITE_BRAND_KO,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath,
  seoMetaDescriptionForPath
} from "@/lib/seoBrand";

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

export default function StoresPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">판매처 목록</h1>
        <p className="text-sm text-slate-600">지도에서 확인한 판매처를 목록으로 볼 수 있어요.</p>
        <nav className="mt-2 text-sm text-slate-600" aria-label="관련 페이지">
          <Link href="/">{SITE_BRAND_KO} 홈</Link>
          {" · "}
          <Link href="/gangnam">강남 종량제 봉투 안내</Link>
        </nav>
      </header>
      <StoreList contentState={mockStores.length ? "ready" : "empty"} stores={mockStores} />
      <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        {SITE_BRAND_KO}
      </footer>
    </main>
  );
}
