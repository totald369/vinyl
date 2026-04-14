"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEEPLINK_SHORT_STORAGE_KEY, isValidShortCode } from "@/lib/shortLink";

type Props = {
  shortCode: string;
};

/**
 * Mobile in-app browsers (KakaoTalk, etc.) sometimes drop `?s=` after client-side router.replace.
 * Hard navigation keeps the query in the location bar and avoids a broken deep-link chain.
 */
export default function ShortLinkRedirect({ shortCode }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!isValidShortCode(shortCode)) {
      router.replace("/");
      return;
    }
    try {
      sessionStorage.setItem(DEEPLINK_SHORT_STORAGE_KEY, shortCode);
    } catch {
      /* private mode */
    }
    if (typeof window === "undefined") return;
    window.location.replace(
      `${window.location.origin}/?s=${encodeURIComponent(shortCode)}`
    );
  }, [shortCode, router]);

  return (
    <main className="mx-auto flex min-h-[40vh] max-w-md items-center justify-center px-4 text-center text-sm text-[#555555]">
      <p className="sr-only" aria-live="polite">
        {"\uC9C0\uB3C4\uB85C \uC774\uB3D9 \uC911\uC785\uB2C8\uB2E4."}
      </p>
    </main>
  );
}
