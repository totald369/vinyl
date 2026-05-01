/** 프로덕션 사이트 URL (canonical, OG, sitemap, robots 공통) */
export const SITE_URL = "https://www.trashbagmap.com" as const;

/** www 선호 도메인(호스트명만) — apex에서 308 영구 리다이렉트 타깃·robots Host */
export const SITE_CANONICAL_HOST = "www.trashbagmap.com" as const;

/** 비-www apex — 크롤러·사용자 진입 시 www로 단일 호프 리다이렉트 */
export const SITE_APEX_HOST = "trashbagmap.com" as const;
