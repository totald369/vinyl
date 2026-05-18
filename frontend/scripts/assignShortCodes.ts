import fs from "fs";
import path from "path";
import { isValidShortCode } from "@/lib/shortLinkCore";
import { generateShortCode } from "@/lib/shortLink.server";

type StoreRow = Record<string, unknown> & { shortCode?: string };

const DATA_DIR = path.join(process.cwd(), "public", "data");
const SOURCE_FILES = [
  "stores.sample.json",
  "stores.gunpo.json",
  "stores.goyang.json",
  "stores.goyang-sticker.json",
  "stores.guro-noncombust.json",
  "stores.gwanak-noncombust.json",
  "stores.dobong-noncombust.json",
  "stores.bucheon-gbms.json",
  "stores.busan-namgu-trash.json",
  "stores.busan-junggu-trash.json",
  "stores.busan-junggu-pp.json",
  "stores.busan-donggu-trash.json",
  "stores.busan-dongnae-trash.json",
  "stores.busan-geumjeong-trash.json",
  "stores.busan-geumjeong-special.json",
  "stores.busan-bukgu-trash.json",
  "stores.busan-bukgu-special.json",
  "stores.busan-sasang-trash.json",
  "stores.busan-sasang-special.json",
  "stores.busan-haeundae-trash.json",
  "stores.busan-yeongdo-trash.json",
  "stores.gyeonggi-gwangju-findstore.json",
  "stores.gwangju-trash-lifeinsights.json",
  "stores.daegu-buk-dalseo-trash.json",
  "stores.incheon-michuhol-trash.json",
  "stores.incheon-yeonsu-trash-sticker.json",
  "stores.incheon-namdong-trash.json",
  "stores.incheon-bupyeong-trash-sticker-special.json",
  "stores.incheon-gyeyang-gbms.json",
  "stores.gyeonggi-siheung-trash.json",
  "stores.daejeon-donggu-trash.json",
  "stores.daejeon-yuseong-trash.json",
  "stores.daejeon-daedeok-trash.json",
  "stores.gangwon-wonju-trash.json",
  "stores.gangwon-taebaek-trash.json",
  "stores.ulsan-donggu-trash.json",
  "stores.ulsan-bukgu-trash.json",
  "stores.ulsan-bukgu-special.json",
  "stores.ulsan-junggu-trash.json",
  "stores.ulsan-junggu-special.json",
  "stores.chungbuk-chungju-trash.json",
  "stores.chungnam-trash.json",
  "stores.chungnam-gongju-trash.json",
  "stores.chungnam-gongju-special.json",
  "stores.chungbuk-cheongju-trash.json",
  "stores.chungbuk-jeungpyeong-trash.json",
  "stores.seoul-yangcheon-special.json"
] as const;

type LoadedFile = {
  name: string;
  fullPath: string;
  rows: StoreRow[];
  dirty: boolean;
};

function nextUniqueCode(used: Set<string>): string {
  let guard = 0;
  while (guard < 100_000) {
    const code = generateShortCode();
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
    guard++;
  }
  throw new Error("shortcodes:assign failed to allocate unique shortCode");
}

function main() {
  const loaded: LoadedFile[] = [];

  for (const name of SOURCE_FILES) {
    const fullPath = path.join(DATA_DIR, name);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`missing source file: ${name}`);
    }
    const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`source is not array: ${name}`);
    }
    loaded.push({ name, fullPath, rows: parsed as StoreRow[], dirty: false });
  }

  const used = new Set<string>();
  for (const file of loaded) {
    for (const row of file.rows) {
      const code = typeof row.shortCode === "string" ? row.shortCode.trim() : "";
      if (isValidShortCode(code)) {
        used.add(code);
      }
    }
  }

  let assignedCount = 0;
  for (const file of loaded) {
    for (let i = 0; i < file.rows.length; i++) {
      const row = file.rows[i];
      const code = typeof row.shortCode === "string" ? row.shortCode.trim() : "";
      if (isValidShortCode(code)) {
        continue;
      }
      const nextCode = nextUniqueCode(used);
      file.rows[i] = { ...row, shortCode: nextCode };
      file.dirty = true;
      assignedCount++;
    }
  }

  // Validate global uniqueness after assignment.
  const counts = new Map<string, number>();
  for (const file of loaded) {
    for (const row of file.rows) {
      const code = typeof row.shortCode === "string" ? row.shortCode.trim() : "";
      if (!isValidShortCode(code)) {
        throw new Error(`invalid shortCode remains in ${file.name}`);
      }
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  const duplicates = [...counts.entries()].filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    throw new Error(`duplicate shortCode detected after assignment: ${duplicates[0]?.[0] ?? "unknown"}`);
  }

  for (const file of loaded) {
    if (!file.dirty) continue;
    fs.writeFileSync(file.fullPath, `${JSON.stringify(file.rows, null, 2)}\n`, "utf8");
    console.log(`updated ${file.name}`);
  }

  console.log(`shortcodes:assign done (assigned=${assignedCount})`);
}

main();
