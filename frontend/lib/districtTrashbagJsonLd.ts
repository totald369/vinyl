import fs from "fs";
import path from "path";

import type { DistrictTrashbagConfig } from "@/lib/districtTrashbagSeo";
import { SITE_URL } from "@/lib/site";

type RawRow = {
  name?: string;
  lat?: number;
  lng?: number;
  roadAddress?: string;
  address?: string;
};

const MAX_ITEMS = 18;

export function buildDistrictTrashbagJsonLd(cfg: DistrictTrashbagConfig, pagePath: string) {
  const filePath = path.join(process.cwd(), "public/data/stores.sample.json");
  let rows: RawRow[] = [];
  try {
    rows = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RawRow[];
  } catch {
    rows = [];
  }

  const needle = cfg.addressKeyword.toLowerCase();
  const matched = rows.filter((r) => {
    const blob = `${r.roadAddress ?? ""} ${r.address ?? ""}`.toLowerCase();
    return (
      blob.includes(needle) &&
      typeof r.name === "string" &&
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lng)
    );
  });

  const sample = matched.slice(0, MAX_ITEMS);
  const pageUrl = `${SITE_URL}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${cfg.labelGu} 종량제 봉투·불연성마대 판매처 지도`,
    description: `${cfg.labelGu} 종량제 봉투 및 불연성마대 판매처를 지도에서 확인합니다.`,
    url: pageUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "trashbagmap",
      url: SITE_URL
    },
    about: {
      "@type": "Place",
      name: cfg.labelGu,
      address: {
        "@type": "PostalAddress",
        addressLocality: cfg.labelGu,
        addressRegion: "서울특별시",
        addressCountry: "KR"
      }
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: matched.length,
      itemListElement: sample.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "LocalBusiness",
          name: r.name,
          address: r.roadAddress || r.address || cfg.labelGu,
          geo: {
            "@type": "GeoCoordinates",
            latitude: r.lat,
            longitude: r.lng
          }
        }
      }))
    }
  };
}
