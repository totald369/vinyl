import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import HomeClient from "@/app/HomeClient";
import { getMergedStores } from "@/lib/server/storeDataset";
import { SITE_BRAND_KO } from "@/lib/seoBrand";
import { getHomePageMetadata, storeShareLinkMetadata } from "@/lib/storePageMetadata";
import { getStoreByShortCode, isValidShortCode } from "@/lib/shortLink";

export const dynamic = "force-dynamic";

type Props = {
  params: { shortCode: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = params.shortCode?.trim() ?? "";
  if (!isValidShortCode(raw)) {
    return { ...getHomePageMetadata(), robots: { index: false, follow: true } };
  }
  try {
    const store = getStoreByShortCode(getMergedStores(), raw);
    if (!store) {
      return { ...getHomePageMetadata(), robots: { index: false, follow: true } };
    }
    return storeShareLinkMetadata(store, raw);
  } catch {
    return getHomePageMetadata();
  }
}

export default async function ShortLinkPage({ params }: Props) {
  const raw = params.shortCode?.trim() ?? "";
  if (!isValidShortCode(raw)) {
    redirect("/");
  }
  try {
    const store = getStoreByShortCode(getMergedStores(), raw);
    if (!store) {
      redirect("/");
    }
  } catch {
    redirect("/");
  }

  return (
    <>
      <p className="sr-only">
        {SITE_BRAND_KO}
        {"\uC5D0\uC11C \uC885\uB7C9\uC81C \uBD09\uD22C, \uBD88\uC5F0\uC131\uB9C8\uB300, PP\uB9C8\uB300, \uAC74\uC124\uB9C8\uB300, \uD3D0\uAE30\uBB3C \uC2A4\uD2F0\uCEE4 \uD310\uB9E4\uCC98\uB97C \uC704\uCE58\u00B7\uC8FC\uC18C\u00B7\uC5C5\uCCB4\uBA85\uC73C\uB85C \uAC80\uC0C9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
      </p>
      <Suspense
        fallback={
          <main className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-bg-canvas" aria-hidden />
        }
      >
        <HomeClient initialShortCode={raw} />
      </Suspense>
    </>
  );
}
