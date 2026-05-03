import type { Metadata } from "next";
import { Suspense } from "react";
import RegionPickerClient from "@/components/regions/RegionPickerClient";
import { regionsPickerMetadata } from "@/lib/regionPageMetadata";

export const metadata: Metadata = regionsPickerMetadata();

export default function RegionsPickerPage() {
  return (
    <Suspense
      fallback={<main className="mx-auto min-h-[100dvh] max-w-md bg-bg-canvas" aria-hidden />}
    >
      <RegionPickerClient />
    </Suspense>
  );
}
