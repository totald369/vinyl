import type { MetadataRoute } from "next";
import { mockStores } from "@/lib/mock";
import { SITE_URL } from "@/lib/site";

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

  const storeEntries: MetadataRoute.Sitemap = mockStores.map((store) => ({
    url: `${SITE_URL}/stores/${store.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6
  }));

  return [...staticEntries, ...storeEntries];
}
