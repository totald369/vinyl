import type { MetadataRoute } from "next";
import { SITE_CANONICAL_HOST, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    /** Host 줄은 호스트명만(스킴 미포함)이 일반적인 관례 */
    host: SITE_CANONICAL_HOST
  };
}
