import type { Metadata } from "next";

import { buildHomeMetadata, buildStoreMetadata } from "@/lib/seo";
import type { StoreData } from "@/lib/storeData";

/** Root `/` — shared with invalid /s/[shortCode] metadata fallback. */
export function getHomePageMetadata(): Metadata {
  return buildHomeMetadata();
}

/** Share URL `/s/{shortCode}`: full OG + Twitter for link previews. */
export function storeShareLinkMetadata(store: StoreData, shortCode: string): Metadata {
  return buildStoreMetadata(store, { path: `/s/${shortCode}` });
}

/**
 * Store detail `/stores/[id]`: title, description, canonical, OG, Twitter.
 * @param path pathname only, e.g. `/stores/abc`
 */
export function storeSeoMetadata(store: StoreData, opts: { path: string }): Metadata {
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  return buildStoreMetadata(store, { path });
}
