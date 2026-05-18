/** 지도 LCP placeholder — 카카오맵 톤 그라데이션 WebP (모바일 뷰포트 비율) */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const W = 448;
const H = 600;
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/static/map-placeholder.webp"
);

const rgb = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const grid = (x % 64 < 1 || y % 64 < 1) ? -10 : 0;
    const vignette = Math.floor(((x / W) * 6 + (y / H) * 4));
    rgb[i] = Math.min(255, 0xe4 + vignette + grid);
    rgb[i + 1] = Math.min(255, 0xe9 + vignette + grid);
    rgb[i + 2] = Math.min(255, 0xee + vignette + grid);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
  .webp({ quality: 55, effort: 6 })
  .toFile(OUT);

const stat = fs.statSync(OUT);
console.log(`[generate-map-placeholder] ${OUT} (${stat.size} bytes, ${W}×${H})`);
