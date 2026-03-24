import type { MetadataRoute } from "next";

const BASE = "https://vinyl-ochre.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1
    },
    {
      url: `${BASE}/stores`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8
    },
    {
      url: `${BASE}/report`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7
    },
    {
      url: `${BASE}/gangnam`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8
    }
  ];
}
