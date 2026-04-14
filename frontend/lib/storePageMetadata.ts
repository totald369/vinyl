import type { Metadata } from "next";

import { getStoreMetadata } from "@/lib/storeMetadata";
import { SITE_URL } from "@/lib/site";
import type { StoreData } from "@/lib/storeData";

const siteBase = SITE_URL.replace(/\/$/, "");

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
    robots: { index: true, follow: true },
  };
}
