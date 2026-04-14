import { SITE_BRAND_KO } from "@/lib/seoBrand";

/** Single-line address for OG description and share text. */
export function getStoreDetailAddress(store: {
  roadAddress?: string;
  address?: string;
  name?: string;
}): string {
  const line = (store.roadAddress?.trim() || store.address?.trim() || "").trim();
  return line || (store.name?.trim() ?? "");
}

/** Page title + meta description (OG / Twitter). */
export function getStoreMetadata(store: { name: string; roadAddress?: string; address?: string }) {
  const addressLine = (store.roadAddress?.trim() || store.address?.trim() || "").trim();
  const title = `${SITE_BRAND_KO} - ${store.name}`;
  const description = addressLine || store.name;
  return { title, description };
}
