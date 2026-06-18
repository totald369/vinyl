import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { DISTRICT_TRASHBAG_PAGES } from "@/lib/districtTrashbagSeo";
import { enumerateRegionLeafPathnames } from "@/lib/koreaRegions";
import { SEO_KEYWORD_LANDING_PAGES, seoKeywordLandingPublicPath } from "@/lib/seoKeywordLandings";
import { SITE_URL } from "@/lib/site";
import { getMergedStores } from "@/lib/server/storeDataset";
import { sliceStoresStableForSeo } from "@/lib/seoStoreSlice";

/** sitemap 재생성 주기 — 크롤러·봇 요청 시 origin CPU 절감 */
export const revalidate = 86400;

function sitemapStoreCap(): number {
  const raw = process.env.SITEMAP_STORE_CAP;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(49000, Math.max(500, Math.floor(n)));
  }
  return 5000;
}

const getCachedStoreSitemapEntries = unstable_cache(
  async () => {
    const merged = getMergedStores();
    const capped = sliceStoresStableForSeo(merged, sitemapStoreCap());
    const now = new Date();
    return capped.map((store) => ({
      url: `${SITE_URL}/stores/${encodeURIComponent(store.id)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6
    }));
  },
  ["sitemap-store-entries-v1"],
  { revalidate: 86400 }
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1
    },
    {
      url: `${SITE_URL}/stores`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85
    },
    {
      url: `${SITE_URL}/regions`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.88
    },
    ...SEO_KEYWORD_LANDING_PAGES.map((p) => ({
      url: `${SITE_URL}${seoKeywordLandingPublicPath(p.slug)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.72
    })),
    ...enumerateRegionLeafPathnames().map((pathname) => ({
      url: `${SITE_URL}${pathname}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.65
    })),
    {
      url: `${SITE_URL}/gangnam`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85
    },
    ...DISTRICT_TRASHBAG_PAGES.map((d) => ({
      url: `${SITE_URL}/${d.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9
    })),
    {
      url: `${SITE_URL}/report`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75
    },
    {
      url: `${SITE_URL}/edit-request`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.65
    }
  ];

  const storeEntries = await getCachedStoreSitemapEntries();

  return [...staticEntries, ...storeEntries];
}
