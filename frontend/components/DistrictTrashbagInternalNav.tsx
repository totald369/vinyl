import Link from "next/link";

import {
  DISTRICT_TRASHBAG_PAGES,
  type DistrictTrashbagSlug
} from "@/lib/districtTrashbagSeo";

type Props = {
  currentSlug: DistrictTrashbagSlug;
};

export default function DistrictTrashbagInternalNav({ currentSlug }: Props) {
  const others = DISTRICT_TRASHBAG_PAGES.filter((d) => d.slug !== currentSlug);

  return (
    <nav
      className="mt-10 border-t border-black/10 pt-6 text-body-sm text-text-secondary"
      aria-label="다른 지역 종량제 봉투 페이지"
    >
      <p className="mb-2 font-semibold text-text-primary">다른 지역 보기</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {others.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/${d.slug}`}
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              {d.labelGu} 종량제 봉투·불연성마대
            </Link>
          </li>
        ))}
        <li>
          <Link href="/" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            서울 전체 보기
          </Link>
        </li>
        <li>
          <Link href="/stores" className="underline-offset-2 hover:underline">
            판매처 목록
          </Link>
        </li>
      </ul>
    </nav>
  );
}
