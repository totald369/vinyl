"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isValidShortCode } from "@/lib/shortLink";

type Props = {
  shortCode: string;
  storeExists: boolean;
};

export default function ShortLinkRedirect({ shortCode, storeExists }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!isValidShortCode(shortCode) || !storeExists) {
      router.replace("/");
      return;
    }
    router.replace(`/?s=${encodeURIComponent(shortCode)}`, { scroll: false });
  }, [shortCode, storeExists, router]);

  return (
    <main className="mx-auto flex min-h-[40vh] max-w-md items-center justify-center px-4 text-center text-sm text-[#555555]">
      <p className="sr-only" aria-live="polite">
        {"\uC9C0\uB3C4\uB85C \uC774\uB3D9 \uC911\uC785\uB2C8\uB2E4."}
      </p>
    </main>
  );
}
