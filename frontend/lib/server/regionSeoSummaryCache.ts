import "server-only";

import fs from "fs";
import path from "path";

import {
  districtKeywordCacheKey,
  REGION_SEO_SUMMARY_FILE,
  type RegionSeoSummaryFile,
  type StoredRegionSeoSummary
} from "@/lib/regionSeoSummary";

const DATA_DIR = path.join(process.cwd(), "public", "data");

let cached: RegionSeoSummaryFile | null = null;

function loadSummaryFile(): RegionSeoSummaryFile {
  if (cached) return cached;
  const full = path.join(DATA_DIR, REGION_SEO_SUMMARY_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf8")) as RegionSeoSummaryFile;
    cached = {
      regions: parsed.regions ?? {},
      districtKeywords: parsed.districtKeywords ?? {}
    };
  } catch {
    cached = { regions: {}, districtKeywords: {} };
  }
  return cached;
}

export function getStoredRegionSeoSummary(pathKey: string): StoredRegionSeoSummary | undefined {
  return loadSummaryFile().regions[pathKey];
}

export function getStoredDistrictKeywordSeoSummary(
  keyword: string
): StoredRegionSeoSummary | undefined {
  return loadSummaryFile().districtKeywords[districtKeywordCacheKey(keyword)];
}
