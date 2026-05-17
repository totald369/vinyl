/**
 * Pretendard Variable 경량화 (블로그 방식)
 * @see https://velog.io/@gwak2837/PretendardVariable-woff2-파일-크기-줄이기
 *
 * 1) varLib.instancer wght=400:700
 * 2) pyftsubset + pretendard subset_glyphs.txt + 앱 glyphs.txt
 *
 * 필요: pip install fonttools brotli
 * 실행: node scripts/subset-pretendard-font.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public/fonts/PretendardVariable.source.woff2");
const out = path.join(root, "public/fonts/PretendardVariable.woff2");
const buildDir = path.join(root, "scripts/.font-build");
const pkgGlyphs = path.join(root, "node_modules/pretendard/subset_glyphs.txt");
const appGlyphs = path.join(root, "glyphs.txt");
const mergedGlyphs = path.join(root, "scripts/pretendard-glyphs.txt");

function run(cmd) {
  execSync(cmd, { stdio: "inherit", env: process.env });
}

function mergeGlyphs() {
  const chars = new Set([
    ...fs.readFileSync(pkgGlyphs, "utf8"),
    ...fs.readFileSync(appGlyphs, "utf8"),
    " "
  ]);
  fs.writeFileSync(mergedGlyphs, [...chars].sort().join(""), "utf8");
  console.log(`[subset-pretendard] ${chars.size} glyphs`);
}

function main() {
  if (!fs.existsSync(src)) {
    console.error(
      "[subset-pretendard] Missing PretendardVariable.source.woff2 — place full variable font there first."
    );
    process.exit(1);
  }
  fs.mkdirSync(buildDir, { recursive: true });
  const instanced = path.join(buildDir, "PretendardVariable.400-700.woff2");

  run(`fonttools varLib.instancer --output="${instanced}" "${src}" wght=400:700`);
  mergeGlyphs();
  run(
    `pyftsubset "${instanced}" --flavor=woff2 --output-file="${out}" --text-file="${mergedGlyphs}" --with-zopfli --drop-tables+=GDEF,GPOS,GSUB --no-hinting`
  );

  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`[subset-pretendard] wrote ${out} (${kb} KiB)`);
}

main();
