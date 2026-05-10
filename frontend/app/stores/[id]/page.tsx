import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreDetailPageActions from "@/components/StoreDetailPageActions";
import { StoreProductChips } from "@/components/StoreProductChips";
import { normalizeProvinceAbbrevForDisplay } from "@/lib/koreaProvinceAliases";
import { kakaoDestinationOnlyUrl } from "@/lib/kakaoDirectionsUrl";
import { getMergedStoreById } from "@/lib/server/getMergedStoreById";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import { storeSeoMetadata } from "@/lib/storePageMetadata";

type Props = {
  params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = getMergedStoreById(params.id);
  if (!store) {
    return { title: { absolute: SITE_BRAND_KO } };
  }
  return storeSeoMetadata(store, { path: `/stores/${params.id}` });
}

export default function StoreDetailPage({ params }: Props) {
  const store = getMergedStoreById(params.id);

  if (!store) {
    notFound();
  }

  const rawAddr = store.roadAddress?.trim() || store.address?.trim() || "";
  const addressLine = rawAddr ? normalizeProvinceAbbrevForDisplay(rawAddr) : "";
  const phoneLine = store.phone?.trim();
  const directionsHref = kakaoDestinationOnlyUrl(store);
  const telHref = phoneLine ? `tel:${phoneLine.replace(/\D/g, "")}` : "";

  return (
    <main className="mx-auto max-w-md bg-slate-50 p-4 pb-8">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" className="text-sm text-slate-600">
          뒤로
        </Link>
        <h1 className="text-lg font-semibold">판매처 상세</h1>
      </header>

      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
        {store.adminVerified ? (
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <img src="/Img/Icon/confirm_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
            <span className="text-base font-semibold leading-normal tracking-[0.1px] text-[#0130b6]">
              판매여부 확인완료
            </span>
          </div>
        ) : null}
        <h2 className="text-xl font-bold leading-normal tracking-[0.1px] text-[#171717]">{store.name}</h2>
        {addressLine || phoneLine ? (
          <div className="mt-2 flex flex-col gap-[2px]">
            {addressLine ? (
              <div className="flex items-start gap-1">
                <span className="flex shrink-0 items-start" aria-hidden>
                  <img
                    src="/Img/Icon/address_16.svg"
                    alt=""
                    width={16}
                    height={19}
                    className="h-[19px] w-4 shrink-0"
                  />
                </span>
                <p className="min-w-0 flex-1 text-base font-normal leading-[1.4] text-[#555555]">{addressLine}</p>
              </div>
            ) : null}
            {phoneLine ? (
              <a href={telHref} className="flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <Image
                  src="/Img/Icon/phone_16.png"
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 shrink-0"
                  sizes="16px"
                />
                <span className="text-base font-normal leading-[1.4] text-[#555555]">{phoneLine}</span>
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3">
          <StoreProductChips store={store} />
        </div>
        <StoreDetailPageActions store={store} directionsHref={directionsHref} addressLine={addressLine} />
      </section>


      <nav className="mt-6 text-sm text-slate-600" aria-label="관련 페이지">
        <Link href="/stores">판매처 목록</Link>
        {" · "}
        <Link href="/gangnam">강남 종량제 봉투 안내</Link>
        {" · "}
        <Link href="/">{SITE_BRAND_KO} 홈</Link>
      </nav>

      <footer className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        {SITE_BRAND_KO}
      </footer>
    </main>
  );
}
