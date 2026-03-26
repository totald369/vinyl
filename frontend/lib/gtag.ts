export const GA_MEASUREMENT_IDS = ["G-GBHBG0TJWB", "G-80ZYJJ27G5"] as const;
export const GA_MEASUREMENT_ID = GA_MEASUREMENT_IDS[0];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function sendGtagPageView(path: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  for (const id of GA_MEASUREMENT_IDS) {
    window.gtag("config", id, { page_path: path });
  }
}
