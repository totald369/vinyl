import { normalizeProvinceAbbrevForDisplay } from "@/lib/koreaProvinceAliases";
import {
  buildStoreSeoDescription,
  buildStoreSeoTitle,
  type StoreProductSource
} from "@/lib/seo";

/** Single-line address for OG description and share text. */
export function getStoreDetailAddress(store: {
  roadAddress?: string;
  address?: string;
  name?: string;
}): string {
  const line = normalizeProvinceAbbrevForDisplay(
    (store.roadAddress?.trim() || store.address?.trim() || "").trim()
  );
  return line || (store.name?.trim() ?? "");
}

/** Page title + meta description (OG / Twitter / 공유). */
export function getStoreMetadata(store: StoreProductSource & { name: string }) {
  return {
    title: buildStoreSeoTitle(store),
    description: buildStoreSeoDescription(store)
  };
}
