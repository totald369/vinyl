import type { MetadataRoute } from "next";
import { SITE_BRAND_KO } from "@/lib/seoBrand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_BRAND_KO,
    short_name: SITE_BRAND_KO,
    description: "종량제 봉투·불연성마대·폐기물 스티커 판매처를 지금 바로 지도에서 찾기",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      {
        src: "/Img/Icon/trash_bag_24.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
