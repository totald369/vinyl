/** 지도 LCP placeholder — 1×1 WebP (브라우저가 800×600으로 스케일) */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/static/map-placeholder.webp"
);

// Valid 1×1 lossy WebP
const WEBP = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64"
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, WEBP);
console.log(`[generate-map-placeholder] ${OUT} (${WEBP.length} bytes)`);
