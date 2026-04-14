"use client";

import Link from "next/link";
import type { StoreData } from "@/hooks/useStores";
import { SHOW_STORE_EDIT_REQUEST_BUTTON } from "@/lib/featureFlags";

type Props = {
  store: StoreData;
  directionsHref: string;
  addressLine: string;
};

export default function StoreDetailPageActions({ store, directionsHref, addressLine }: Props) {
  return (
    <>
      <div className="mt-6 flex w-full gap-1">
        <a
          href={directionsHref}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 w-full items-center justify-center rounded-[8px] bg-[#171717] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c]"
        >
          {"\uCE74\uCE74\uC624\uB9F5 \uAE38\uCC3E\uAE30"}
        </a>
      </div>

      {SHOW_STORE_EDIT_REQUEST_BUTTON ? (
        <div className="mt-3 text-center">
          <Link
            href={`/edit-request?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}&storeAddress=${encodeURIComponent(addressLine)}`}
            className="text-[14px] font-semibold text-[#111111] underline-offset-2 hover:underline"
          >
            정보 수정 요청
          </Link>
        </div>
      ) : null}
    </>
  );
}
