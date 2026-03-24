import Link from "next/link";
import { notFound } from "next/navigation";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";
import { mockStores } from "@/lib/mock";
import { FILTER_LABELS } from "@/lib/types";

type Props = {
  params: { id: string };
};

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
              href="/edit-request"
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
    </main>
  );
}
