import fs from "fs";
import path from "path";
import { generateShortCode, isValidShortCode } from "@/lib/shortLink";
import { STORE_DATA_JSON_FILES } from "@/lib/storeDataSourceFiles";

type StoreRow = Record<string, unknown> & { shortCode?: string };

const DATA_DIR = path.join(process.cwd(), "public", "data");
// 단일 출처: 병합에 쓰는 데이터 소스 목록을 그대로 사용해 누락을 방지한다.
const SOURCE_FILES = STORE_DATA_JSON_FILES;

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
      // 병합 빌드와 동일하게 디스크에 없는 소스는 건너뛴다.
      console.warn(`skip missing source file: ${name}`);
      continue;
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
