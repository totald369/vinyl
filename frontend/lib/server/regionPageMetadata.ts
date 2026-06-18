import type { Metadata } from "next";

import { leafToRegionPath, type ResolvedRegionLeaf } from "@/lib/koreaRegions";
import {
  buildAreaMetadataFromSummary,
  buildDistrictMetadata,
  buildRegionMetadata,
  regionProductSummaryFromStored
} from "@/lib/seo";
import {
  getStoredDistrictKeywordSeoSummary,
  getStoredRegionSeoSummary
} from "@/lib/server/regionSeoSummaryCache";
import { getStoresForDistrictKeyword, getStoresForRegionLeaf } from "@/lib/server/regionSeoStores";

export function buildRegionStoreMetadata(opts: {
  headingLabelKo: string;
  pathname: string;
  leaf: ResolvedRegionLeaf;
}): Metadata {
  const pathKey = leafToRegionPath(opts.leaf);
  const isDistrictLevel = Boolean(opts.leaf.districtSlug);
  const stored = getStoredRegionSeoSummary(pathKey);

  if (stored) {
    return buildAreaMetadataFromSummary(
      opts.headingLabelKo,
      regionProductSummaryFromStored(stored),
      stored.storeCount,
      { path: opts.pathname, districtLevel: isDistrictLevel }
    );
  }

  const stores = getStoresForRegionLeaf(opts.leaf);
  if (isDistrictLevel) {
    return buildDistrictMetadata(opts.headingLabelKo, opts.headingLabelKo, stores, {
      path: opts.pathname
    });
  }
  return buildRegionMetadata(opts.headingLabelKo, stores, {
    path: opts.pathname
  });
}

export function buildDistrictTrashbagMetadata(opts: {
  labelGu: string;
  addressKeyword: string;
  path: string;
}): Metadata {
  const stored = getStoredDistrictKeywordSeoSummary(opts.addressKeyword);
  if (stored) {
    return buildAreaMetadataFromSummary(
      opts.labelGu,
      regionProductSummaryFromStored(stored),
      stored.storeCount,
      { path: opts.path, districtLevel: true }
    );
  }

  const stores = getStoresForDistrictKeyword(opts.addressKeyword);
  return buildDistrictMetadata(opts.labelGu, opts.labelGu, stores, { path: opts.path });
}
