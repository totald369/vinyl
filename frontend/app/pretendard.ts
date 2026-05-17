import localFont from "next/font/local";

/**
 * Pretendard Variable 단일 파일 — dynamic-subset CSS(다수 woff2·critical path 누적) 대신 1 RTT.
 */
export const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
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
