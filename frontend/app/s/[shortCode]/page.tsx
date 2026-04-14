import type { Metadata } from "next";

import ShortLinkRedirect from "./ShortLinkRedirect";
import { getMergedStores } from "@/lib/server/storeDataset";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import { storeSeoMetadata } from "@/lib/storePageMetadata";
import { getStoreByShortCode, isValidShortCode } from "@/lib/shortLink";

export const dynamic = "force-dynamic";

type Props = {
  params: { shortCode: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = params.shortCode?.trim() ?? "";
  if (!isValidShortCode(raw)) {
    return { title: { absolute: SITE_BRAND_KO }, robots: { index: false, follow: true } };
  }
  try {
    const store = getStoreByShortCode(getMergedStores(), raw);
    if (!store) {
      return { title: { absolute: SITE_BRAND_KO }, robots: { index: false, follow: true } };
    }
    return storeSeoMetadata(store, { path: `/s/${raw}` });
  } catch {
    return { title: { absolute: SITE_BRAND_KO } };
  }
}

export default function ShortLinkPage({ params }: Props) {
  const raw = params.shortCode?.trim() ?? "";
  return <ShortLinkRedirect shortCode={raw} />;
}
