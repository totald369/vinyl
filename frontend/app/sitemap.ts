import type { MetadataRoute } from "next";
import { DISTRICT_TRASHBAG_PAGES } from "@/lib/districtTrashbagSeo";
import { SITE_URL } from "@/lib/site";
import { getMergedStores } from "@/lib/server/storeDataset";
import { sliceStoresStableForSeo } from "@/lib/seoStoreSlice";

function sitemapStoreCap(): number {
  const raw = process.env.SITEMAP_STORE_CAP;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(49000, Math.max(500, Math.floor(n)));
  }
  return 5000;
}

export default function sitemap(): MetadataRoute.Sitemap {
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

  const merged = getMergedStores();
  const capped = sliceStoresStableForSeo(merged, sitemapStoreCap());
  const storeEntries: MetadataRoute.Sitemap = capped.map((store) => ({
    url: `${SITE_URL}/stores/${encodeURIComponent(store.id)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6
  }));

  return [...staticEntries, ...storeEntries];
}
