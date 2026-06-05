import { SITE_URL } from "@/lib/site";

export type ShareUtmPreset = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

const DEFAULT_STORE_SHARE: Required<Pick<ShareUtmPreset, "utm_source" | "utm_medium" | "utm_campaign">> =
  {
    utm_source: "share",
    utm_medium: "store_detail",
    utm_campaign: "store_share"
  };

const DEFAULT_REGION_SHARE: Required<Pick<ShareUtmPreset, "utm_source" | "utm_medium" | "utm_campaign">> =
  {
    utm_source: "share",
    utm_medium: "region_page",
    utm_campaign: "region_share"
  };

/**
 * 기존 query는 유지하고, 없는 UTM 키만 추가한다(중복·덮어쓰기 없음).
 */
export function appendShareUtmParams(url: string, preset: ShareUtmPreset = {}): string {
  try {
    const base = url.startsWith("http") ? url : `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`;
    const parsed = new URL(base);
    const params = parsed.searchParams;

    const entries: [string, string | undefined][] = [
      ["utm_source", preset.utm_source],
      ["utm_medium", preset.utm_medium],
      ["utm_campaign", preset.utm_campaign],
      ["utm_content", preset.utm_content],
      ["utm_term", preset.utm_term]
    ];

    for (const [key, value] of entries) {
      if (!value?.trim()) continue;
      if (!params.has(key)) {
        params.set(key, value.trim());
      }
    }

    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}

export function appendStoreShareUtm(url: string, storeIdOrCode: string): string {
  return appendShareUtmParams(url, {
    ...DEFAULT_STORE_SHARE,
    utm_content: storeIdOrCode
  });
}

export function appendRegionShareUtm(url: string, regionSlug: string): string {
  return appendShareUtmParams(url, {
    ...DEFAULT_REGION_SHARE,
    utm_content: regionSlug
  });
}
