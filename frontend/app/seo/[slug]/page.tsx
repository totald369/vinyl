import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSeoKeywordLandingBySlug,
  SEO_KEYWORD_LANDING_PAGES,
  sampleSeoLandingsExclusiveOf,
  seoKeywordLandingPublicPath,
  seoKeywordLandingRegionHref
} from "@/lib/seoKeywordLandings";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import { SITE_CANONICAL_HOST } from "@/lib/site";
import type { Route } from "next";

export function generateStaticParams(): { slug: string }[] {
  return SEO_KEYWORD_LANDING_PAGES.map((p) => ({ slug: p.slug }));
}

type PageProps = { params: { slug: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = getSeoKeywordLandingBySlug(params.slug);
  if (!page) {
    return { title: `안내 | ${SITE_BRAND_KO}` };
  }
  const pathname = seoKeywordLandingPublicPath(page.slug);
  const title = `${page.headline} | ${SITE_BRAND_KO}`;
  const teaser = page.paragraphs[0] ?? `${page.headline} 지역 판매처는 지도로 확인합니다.`;
  const description =
    teaser.length <= 156 ? teaser : teaser.slice(0, 153).trimEnd().replace(/[,\\s]+$/, "") + "…";
  const url = `https://${SITE_CANONICAL_HOST}${pathname}`;

  return {
    title,
    description,
    openGraph: { title, description, url, siteName: SITE_BRAND_KO, locale: "ko_KR", type: "article" },
    twitter: { card: "summary", title, description },
    alternates: { canonical: pathname }
  };
}

export default function SeoKeywordLandingPage({ params }: PageProps) {
  const page = getSeoKeywordLandingBySlug(params.slug);
  if (!page) notFound();

  const regionHref = seoKeywordLandingRegionHref(page);
  const others = sampleSeoLandingsExclusiveOf(page.slug);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-md bg-white px-4 pb-12 pt-[calc(16px+env(safe-area-inset-top))]">
      <nav className="mb-6 flex items-center gap-2 text-[14px]" aria-label="상위 페이지">
        <Link href="/" className="text-[#454545] underline-offset-4 hover:underline">
          홈
        </Link>
        <span aria-hidden className="text-neutral-400">
          ·
        </span>
        <Link href="/regions" className="text-[#454545] underline-offset-4 hover:underline">
          지역 선택
        </Link>
      </nav>

      <article>
        <h1 className="text-[22px] font-bold leading-snug tracking-[-0.2px] text-[#171717]">
          {page.headline}
        </h1>
        <div className="mt-5 space-y-4 text-[15px] font-normal leading-[1.65] tracking-[0.05px] text-[#333]">
          {page.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </article>

      <div className="mt-10 flex flex-col gap-3">
        <Link
          href={regionHref}
          className="flex h-12 w-full items-center justify-center rounded-[10px] bg-[#171717] text-[16px] font-bold text-[#d4fe1c] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          이 지역 판매처 지도·목록 열기
        </Link>
        <Link
          href={"/regions" as Route}
          className="flex h-12 w-full items-center justify-center rounded-[10px] border border-[#171717] text-[16px] font-semibold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          다른 지역 고르기
        </Link>
      </div>

      <section className="mt-12 border-t border-neutral-100 pt-8" aria-labelledby="seo-related">
        <h2 id="seo-related" className="text-[15px] font-bold text-[#171717]">
          함께 찾아보기
        </h2>
        <ul className="mt-3 space-y-2 text-[14px] leading-snug text-[#454545]">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={seoKeywordLandingPublicPath(o.slug) as Route} className="underline-offset-4 hover:underline">
                {o.headline}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
