/**
 * Pretendard variable dynamic-subset → public/fonts (빌드 시 1회 복사).
 * 페이지에 쓰인 글자만 unicode-range 로 로드 (~40KiB/블록, 초기 1MB+ 정적 4웨이트 제거).
 */
import fs from "fs";
import path from "path";

const PKG = path.join(process.cwd(), "node_modules/pretendard/dist/web/variable");
const SUBSET_SRC = path.join(PKG, "woff2-dynamic-subset");
const SUBSET_DEST = path.join(process.cwd(), "public/fonts/pretendard-variable");
const CSS_SRC = path.join(PKG, "pretendardvariable-dynamic-subset.css");
const CSS_DEST = path.join(process.cwd(), "public/fonts/pretendard-variable.css");

function main() {
  if (!fs.existsSync(SUBSET_SRC)) {
    console.warn("[copy-pretendard-fonts] pretendard package missing, skip");
    return;
  }

  fs.mkdirSync(SUBSET_DEST, { recursive: true });
  for (const name of fs.readdirSync(SUBSET_SRC)) {
    if (!name.endsWith(".woff2")) continue;
    fs.copyFileSync(path.join(SUBSET_SRC, name), path.join(SUBSET_DEST, name));
  }

  let css = fs.readFileSync(CSS_SRC, "utf8");
  css = css.replace(/'Pretendard Variable'/g, "'Pretendard'");
  css = css.replace(/\.\/woff2-dynamic-subset\//g, "/fonts/pretendard-variable/");
  fs.writeFileSync(CSS_DEST, css);

  const count = fs.readdirSync(SUBSET_DEST).filter((f) => f.endsWith(".woff2")).length;
  console.log(`[copy-pretendard-fonts] ${count} subset files + CSS → public/fonts/`);
}

main();
