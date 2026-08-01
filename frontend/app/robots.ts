import type { MetadataRoute } from "next";
import { SITE_CANONICAL_HOST, SITE_URL } from "@/lib/site";

/**
 * 봇 정책 (쓰봉맵):
 * - 허용: 검색·국내 유입·SNS 프리뷰에 필요한 크롤러
 * - 제한: AI 학습/스크래핑·SEO 감사·해외 검색(국내 무관) 봇
 *
 * robots.txt는 준수하는 봇용 요청이다, 무시하는 봇은 Vercel Bot Protection/WAF로 별도 차단.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/"
      },
      // —— 검색·국내 유입 (명시 허용) ——
      { userAgent: "Googlebot", allow: "/" },
      { userAgent: "Googlebot-Image", allow: "/" },
      { userAgent: "Google-Read-Aloud", allow: "/" },
      { userAgent: "Naverbot", allow: "/" },
      { userAgent: "Yeti", allow: "/" },
      { userAgent: "Bingbot", allow: "/" },
      { userAgent: "Applebot", allow: "/" },
      // SNS / 메신저 OG 프리뷰
      { userAgent: "facebookexternalhit", allow: "/" },
      { userAgent: "Twitterbot", allow: "/" },
      { userAgent: "Discordbot", allow: "/" },
      { userAgent: "kakaotalk-scrap", allow: "/" },
      { userAgent: "Slackbot", allow: "/" },
      // —— AI 학습·검색 봇 ——
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "anthropic-ai", disallow: "/" },
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ChatGPT-User", disallow: "/" },
      { userAgent: "OAI-SearchBot", disallow: "/" },
      { userAgent: "Google-Extended", disallow: "/" },
      { userAgent: "Bytespider", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "Diffbot", disallow: "/" },
      // —— SEO 감사·스크래퍼 ——
      { userAgent: "AhrefsBot", disallow: "/" },
      { userAgent: "SemrushBot", disallow: "/" },
      { userAgent: "MJ12bot", disallow: "/" },
      { userAgent: "DotBot", disallow: "/" },
      { userAgent: "PetalBot", disallow: "/" },
      { userAgent: "DataForSeoBot", disallow: "/" },
      // —— 국내 유입과 무관한 검색 ——
      { userAgent: "YandexBot", disallow: "/" },
      { userAgent: "Yandex", disallow: "/" }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    /** Host 줄은 호스트명만(스킴 미포함)이 일반적인 관례 */
    host: SITE_CANONICAL_HOST
  };
}
