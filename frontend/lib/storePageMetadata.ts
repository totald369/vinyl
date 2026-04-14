import type { Metadata } from "next";

import { getStoreMetadata } from "@/lib/storeMetadata";
import {
  DEFAULT_OG_IMAGE_ALT,
  defaultOpenGraphImage,
  seoAbsoluteMetaTitleForPath,
  seoMetaDescriptionForPath,
  SITE_BRAND_KO
} from "@/lib/seoBrand";
import { SITE_URL } from "@/lib/site";
import type { StoreData } from "@/lib/storeData";

const siteBase = SITE_URL.replace(/\/$/, "");

const HOME_TITLE = seoAbsoluteMetaTitleForPath("/");
const HOME_DESCRIPTION = seoMetaDescriptionForPath("/");

/** Root `/` — shared with invalid /s/[shortCode] metadata fallback. */
export function getHomePageMetadata(): Metadata {
  return {
    alternates: { canonical: "/" },
    title: { absolute: HOME_TITLE },
    description: HOME_DESCRIPTION,
    openGraph: {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      url: "/",
      siteName: SITE_BRAND_KO,
      images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }]
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [defaultOpenGraphImage.url]
    }
  };
}

/** Share URL `/s/{shortCode}`: full OG + Twitter for link previews. */
export function storeShareLinkMetadata(store: StoreData, shortCode: string): Metadata {
  const { title, description } = getStoreMetadata(store);
  const path = `/s/${shortCode}`;
  const url = `${siteBase}${path}`;

  return {
    alternates: { canonical: url },
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_BRAND_KO,
      type: "website",
      images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [defaultOpenGraphImage.url]
    }
  };
}

/**
 * Store detail and /s/[shortCode]: document title, description, canonical only (no OG/Twitter overrides).
 * @param path pathname only, e.g. `/stores/abc` or `/s/xyzxyz`
 */
export function storeSeoMetadata(store: StoreData, opts: { path: string }): Metadata {
  const { title, description } = getStoreMetadata(store);
  const url = `${siteBase}${opts.path.startsWith("/") ? opts.path : `/${opts.path}`}`;

  return {
    alternates: { canonical: url },
    title: { absolute: title },
    description,
    robots: { index: true, follow: true }
  };
}
