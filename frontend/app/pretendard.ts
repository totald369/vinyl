import localFont from "next/font/local";

/**
 * Pretendard Variable (~400 KiB) — wght 400–700 + Adobe-KR 글리프 서브셋.
 * 재생성: PretendardVariable.source.woff2 넣고 `node scripts/subset-pretendard-font.mjs`
 */
export const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "400 700",
  variable: "--font-pretendard",
  preload: true,
  fallback: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Apple SD Gothic Neo",
    "Noto Sans KR",
    "Malgun Gothic",
    "sans-serif"
  ]
});
