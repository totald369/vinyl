import DistrictTrashbagClient from "@/components/DistrictTrashbagClient";
import DistrictTrashbagInternalNav from "@/components/DistrictTrashbagInternalNav";
import {
  DISTRICT_TRASHBAG_PAGES,
  buildDistrictExtraIntro,
  districtIntroLeadParagraph,
  districtSeoDescription,
  districtTrashbagH1,
  getDistrictTrashbagConfig,
  isDistrictTrashbagSlug,
  type DistrictTrashbagSlug
} from "@/lib/districtTrashbagSeo";
import { buildDistrictTrashbagJsonLd } from "@/lib/districtTrashbagJsonLd";
import {
  SITE_BRAND_KO,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath
} from "@/lib/seoBrand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamicParams = false;

export function generateStaticParams(): { slug: DistrictTrashbagSlug }[] {
  return DISTRICT_TRASHBAG_PAGES.map((d) => ({ slug: d.slug }));
}

type PageProps = { params: { slug: string } };

export function generateMetadata({ params }: PageProps): Metadata {
  if (!isDistrictTrashbagSlug(params.slug)) {
    return {};
  }
  const cfg = getDistrictTrashbagConfig(params.slug)!;
  const path = `/${cfg.slug}`;
  const title = seoAbsoluteMetaTitleForPath(path);
  const description = districtSeoDescription(cfg);
  return {
    alternates: { canonical: path },
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: path,
      locale: "ko_KR",
      type: "website",
      images: [defaultOpenGraphImage]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [defaultOpenGraphImage.url]
    },
    robots: { index: true, follow: true }
  };
}

export default function DistrictTrashbagPage({ params }: PageProps) {
  if (!isDistrictTrashbagSlug(params.slug)) {
    notFound();
  }

  const cfg = getDistrictTrashbagConfig(params.slug)!;
  const path = `/${cfg.slug}`;
  const jsonLd = buildDistrictTrashbagJsonLd(cfg, path);
  const lead = districtIntroLeadParagraph(cfg.labelGu);
  const extra = buildDistrictExtraIntro(cfg);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-2xl px-4 pb-16 pt-4 md:px-6 md:pt-8">
        <nav className="mb-4 text-body-sm text-text-secondary" aria-label="이동 경로">
          <Link href="/" className="hover:underline">
            쓰봉맵 홈
          </Link>
          <span aria-hidden className="mx-1.5 text-text-tertiary">
            /
          </span>
          <span className="text-text-primary">{cfg.labelGu} 판매처</span>
        </nav>

        <header className="mb-4">
          <h1 className="text-title-lg font-bold text-text-primary md:text-[28px] md:leading-9">
            {districtTrashbagH1(cfg)}
          </h1>
          <p className="mt-3 text-body-md text-text-secondary">{lead}</p>
          <p className="mt-2 text-body-md text-text-secondary">{extra}</p>
        </header>

        <DistrictTrashbagClient config={cfg} />

        <DistrictTrashbagInternalNav currentSlug={cfg.slug} />

        <p className="mt-6 text-caption text-text-tertiary">
          실제 판매 여부·가격·취급 규격은 매장 및{" "}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(cfg.labelGu + " 종량제봉투")}`}
            className="text-text-brand underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {cfg.labelGu} 공식 안내
          </a>
          를 함께 확인해 주세요.
        </p>

        <footer className="mt-10 border-t border-border-subtle pt-6 text-center text-caption text-text-tertiary">
          {SITE_BRAND_KO}
        </footer>
      </article>
    </>
  );
}
