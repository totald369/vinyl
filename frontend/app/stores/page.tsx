import Link from "next/link";
import type { Metadata } from "next";
import StoreList from "@/components/StoreList";
import { mockStores } from "@/lib/mock";

export const metadata: Metadata = {
  alternates: { canonical: "/stores" },
  title: "판매처 목록",
  description:
    "종량제봉투·불연성마대·폐기물 스티커 판매처를 목록으로 확인하세요. 지도 홈에서 내 주변 매장을 검색한 뒤 강남 안내 페이지와 함께 참고할 수 있습니다.",
  openGraph: {
    title: "판매처 목록 | 종량제봉투·스티커",
    description: "샘플 판매처 정보와 품목(종량제봉투, 마대, 스티커)을 한눈에 봅니다.",
    url: "/stores"
  },
  twitter: {
    title: "판매처 목록 | 종량제봉투·스티커",
    description: "샘플 판매처 정보와 품목을 한눈에 봅니다."
  }
};

export default function StoresPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">판매처 목록</h1>
        <p className="text-sm text-slate-600">지도에서 확인한 판매처를 목록으로 볼 수 있어요.</p>
        <nav className="mt-2 text-sm text-slate-600" aria-label="관련 페이지">
          <Link href="/">지도 홈</Link>
          {" · "}
          <Link href="/gangnam">강남 종량제봉투 안내</Link>
        </nav>
      </header>
      <StoreList contentState={mockStores.length ? "ready" : "empty"} stores={mockStores} />
    </main>
  );
}
