import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";
import { mockStores } from "@/lib/mock";
import { FILTER_LABELS } from "@/lib/types";

type Props = {
  params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = mockStores.find((item) => item.id === params.id);
  if (!store) {
    return {};
  }
  const path = `/stores/${params.id}`;
  return {
    alternates: { canonical: path },
    title: store.name,
    description: `${store.address} — ${store.description} 종량제봉투·마대·스티커 판매 정보.`,
    openGraph: {
      title: `${store.name} | 판매처 상세`,
      description: store.description,
      url: path
    },
    robots: { index: true, follow: true }
  };
}

export default function StoreDetailPage({ params }: Props) {
  const store = mockStores.find((item) => item.id === params.id);

  if (!store) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-md bg-slate-50 p-4 pb-8">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" className="text-sm text-slate-600">
          뒤로
        </Link>
        <h1 className="text-lg font-semibold">판매처 상세</h1>
      </header>

      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs text-emerald-600">판매여부 확인완료</div>
        <h2 className="text-xl font-bold">{store.name}</h2>
        <p className="mt-2 text-sm text-slate-600">{store.address}</p>
        <p className="mt-3 text-sm text-slate-500">{store.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {store.products.map((item) => (
            <span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {FILTER_LABELS[item]}
            </span>
          ))}
        </div>
        <div
          className={`mt-6 grid gap-2 ${SHOW_STORE_EDIT_REQUEST_BUTTON ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {SHOW_STORE_EDIT_REQUEST_BUTTON ? (
            <Link
              href={`/edit-request?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}&storeAddress=${encodeURIComponent(store.address)}`}
              className="rounded-xl border border-slate-300 px-3 py-3 text-center text-sm"
            >
              정보 수정 요청
            </Link>
          ) : null}
          <a
            href={`https://map.kakao.com/link/search/${encodeURIComponent(store.name)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-brand-500 px-3 py-3 text-center text-sm text-white"
          >
            카카오맵 길찾기
          </a>
        </div>
      </section>

      <nav className="mt-6 text-sm text-slate-600" aria-label="관련 페이지">
        <Link href="/stores">판매처 목록</Link>
        {" · "}
        <Link href="/gangnam">강남 종량제봉투 안내</Link>
        {" · "}
        <Link href="/">지도 홈</Link>
      </nav>
    </main>
  );
}
