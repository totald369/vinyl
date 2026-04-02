import type { Metadata } from "next";
import {
  DEFAULT_OG_IMAGE_ALT,
  SITE_BRAND_KO,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath,
  seoMetaDescriptionForPath
} from "@/lib/seoBrand";

const PATH = "/report/success";
const TITLE = seoAbsoluteMetaTitleForPath(PATH);
const DESCRIPTION = seoMetaDescriptionForPath(PATH);

export const metadata: Metadata = {
  alternates: { canonical: PATH },
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PATH,
    siteName: SITE_BRAND_KO,
    images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [defaultOpenGraphImage.url],
  },
};

export default function ReportSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
