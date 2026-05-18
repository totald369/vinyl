import Link from "next/link";

import { DISTRICT_TRASHBAG_PAGES } from "@/lib/districtTrashbagSeo";
import { SITE_BRAND_KO } from "@/lib/seoBrand";

/**
 * 지도 단일 페이지에 가려져도 크롤러가 하위 허브·랜딩으로 이동할 수 있도록
 * 레이아웃 하단에 항상 보이거나 스크롤로 노출되는 텍스트 링크 블록.
 */
export default function GlobalSeoNav() {
  return (
    <nav
      aria-label="주요 페이지"
      className="border-t border-slate-200/90 bg-slate-50 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-600"
    >
      <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        <Link href="/" className="underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          {SITE_BRAND_KO} 홈
        </Link>
        <span aria-hidden>·</span>
        <Link href="/stores" className="underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          판매처 목록
        </Link>
        <span aria-hidden>·</span>
        <Link href="/gangnam" className="underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          강남 종량제 봉투 안내
        </Link>
        {DISTRICT_TRASHBAG_PAGES.map((d) => (
          <span key={d.slug} className="contents">
            <span aria-hidden>·</span>
            <Link href={`/${d.slug}`} className="underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              {d.labelGu} 지역 지도·목록
            </Link>
          </span>
        ))}
        <span aria-hidden>·</span>
        <Link
          href="/report"
          prefetch={false}
          className="underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          판매처 제보
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/edit-request"
          prefetch={false}
          className="underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          정보 수정 요청
        </Link>
      </span>
    </nav>
  );
}
