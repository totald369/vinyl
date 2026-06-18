import type { Metadata } from "next";

import type { ResolvedRegionLeaf } from "@/lib/koreaRegions";
import { buildDistrictMetadata, buildRegionMetadata } from "@/lib/seo";
import { getStoresForRegionLeaf } from "@/lib/server/regionSeoStores";

export function buildRegionStoreMetadata(opts: {
  headingLabelKo: string;
  pathname: string;
  leaf: ResolvedRegionLeaf;
}): Metadata {
  const stores = getStoresForRegionLeaf(opts.leaf);
  const isDistrictLevel = Boolean(opts.leaf.districtSlug);

  if (isDistrictLevel) {
    return buildDistrictMetadata(opts.headingLabelKo, opts.headingLabelKo, stores, {
      path: opts.pathname
    });
  }

  return buildRegionMetadata(opts.headingLabelKo, stores, {
    path: opts.pathname
  });
}
