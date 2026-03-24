import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://vinyl-ochre.vercel.app",
      lastModified: new Date()
    }
  ];
}
