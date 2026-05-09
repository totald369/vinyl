/**
 * Supabase 등에서 내보낸 reports_rows.csv 를 public/data/reports_rows.json 에 병합합니다.
 * 동일 id는 CSV 내용으로 덮어씁니다(upsert).
 *
 * 사용 (frontend 디렉터리):
 *   npm run data:import-reports-csv -- /path/to/reports_rows.csv
 *   npx tsx scripts/importReportsCsv.ts   # 기본: ~/Downloads/reports_rows.csv
 */

import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public/data/reports_rows.json");
const DEFAULT_CSV = path.join(os.homedir(), "Downloads/reports_rows.csv");

type ReportJsonRow = {
  id: string;
  report_type: string;
  store_id: string | null;
  name: string;
  road_address: string;
  detail_address: string;
  lat: number | null;
  lng: number | null;
  has_trash_bag: boolean;
  has_special_bag: boolean;
  has_large_waste_sticker: boolean;
  message?: string;
  status: string;
  created_at: string;
};

const EXPECTED = [
  "id",
  "report_type",
  "store_id",
  "name",
  "road_address",
  "detail_address",
  "lat",
  "lng",
  "has_trash_bag",
  "has_special_bag",
  "has_large_waste_sticker",
  "message",
  "status",
  "created_at"
] as const;

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < content.length) {
    const c = content[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      if (c === "\r" && content[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

/** CSV·제보 입력에서 자주 나오는 화성 봉담 구역 오타 정리 + 경기 → 경기도 */
function normalizeRoadAddress(raw: string): string {
  let s = raw.trim();
  s = s.replace(/경기(?:도)?\s*화성시\s*효행구\s+/gi, "경기도 화성시 ");
  if (/^경기\s/.test(s) && !/^경기도/.test(s)) {
    s = s.replace(/^경기\s/, "경기도 ");
  }
  return s.trim();
}

function parseBool(cell: string): boolean {
  const t = cell.trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

function parseNum(cell: string): number | null {
  const t = cell.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function rowFromCells(
  header: string[],
  cells: string[]
): ReportJsonRow | null {
  const map = new Map<string, string>();
  header.forEach((h, j) => {
    map.set(h.trim().toLowerCase(), cells[j] ?? "");
  });
  const id = (map.get("id") ?? "").trim();
  if (!id) return null;

  const storeRaw = (map.get("store_id") ?? "").trim();
  const lat = parseNum(map.get("lat") ?? "");
  const lng = parseNum(map.get("lng") ?? "");

  const out: ReportJsonRow = {
    id,
    report_type: (map.get("report_type") ?? "").trim() || "new_store",
    store_id: storeRaw === "" ? null : storeRaw,
    name: (map.get("name") ?? "").trim(),
    road_address: normalizeRoadAddress(map.get("road_address") ?? ""),
    detail_address: (map.get("detail_address") ?? "").trim(),
    lat,
    lng,
    has_trash_bag: parseBool(map.get("has_trash_bag") ?? ""),
    has_special_bag: parseBool(map.get("has_special_bag") ?? ""),
    has_large_waste_sticker: parseBool(map.get("has_large_waste_sticker") ?? ""),
    status: (map.get("status") ?? "").trim() || "pending",
    created_at: (map.get("created_at") ?? "").trim() || ""
  };
  const msg = (map.get("message") ?? "").trim();
  if (msg) out.message = msg;
  return out;
}

function loadExisting(): ReportJsonRow[] {
  try {
    const raw = fs.readFileSync(OUT, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ReportJsonRow[];
  } catch {
    return [];
  }
}

function main() {
  const csvPath = path.resolve(process.argv[2] || DEFAULT_CSV);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  const body = fs.readFileSync(csvPath, "utf8");
  const table = parseCsv(body.replace(/^\uFEFF/, ""));
  if (!table.length) {
    console.error("CSV is empty");
    process.exit(1);
  }
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  for (let k = 0; k < EXPECTED.length; k++) {
    if (header[k] !== EXPECTED[k]) {
      console.warn(
        `Header column ${k}: expected "${EXPECTED[k]}", got "${header[k]}". Matching by name only.`
      );
      break;
    }
  }

  const byHeader = [...EXPECTED].every((col) => header.includes(col));
  if (!byHeader) {
    console.error(
      `CSV header must include: ${EXPECTED.join(", ")}\ngot: ${header.join(", ")}`
    );
    process.exit(1);
  }

  const existing = loadExisting();
  const byId = new Map<string, ReportJsonRow>();
  for (const r of existing) {
    if (r?.id) byId.set(r.id, r);
  }

  let upserted = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    if (!cells.some((c) => c.trim() !== "")) continue;
    const row = rowFromCells(header, cells);
    if (!row) {
      console.warn(`Skip row ${r + 1}: missing id`);
      continue;
    }
    byId.set(row.id, row);
    upserted++;
  }

  const merged = [...byId.values()].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  fs.writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`Wrote ${merged.length} rows to ${OUT} (${upserted} row(s) from CSV applied).`);
}

main();
