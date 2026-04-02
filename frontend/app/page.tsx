import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import {
  DEFAULT_OG_IMAGE_ALT,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath,
  seoMetaDescriptionForPath,
  SITE_BRAND_KO
} from "@/lib/seoBrand";

const HOME_TITLE = seoAbsoluteMetaTitleForPath("/");
const HOME_DESCRIPTION = seoMetaDescriptionForPath("/");

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    siteName: SITE_BRAND_KO,
    images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [defaultOpenGraphImage.url],
  },
};

export default function HomePage() {
  return (
    <>
      <p className="sr-only">
        {SITE_BRAND_KO}에서 종량제 봉투, 불연성마대, PP마대, 건설마대, 폐기물 스티커 판매처를 위치·주소·업체명으로 검색할
        수 있습니다.
      </p>
      <HomeClient />
    </>
  );
}
