/** 스토어 상세 등: `yyyy.mm.dd 업데이트`. 파싱 실패 시 null */
export function formatDatasetUpdateLabel(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  let compact = String(raw).trim().replace(/\s/g, "");
  if (!compact) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(compact)) {
    compact = compact.slice(0, 10);
  }

  let y: string;
  let m: string;
  let d: string;

  if (/^\d{8}$/.test(compact)) {
    y = compact.slice(0, 4);
    m = compact.slice(4, 6);
    d = compact.slice(6, 8);
  } else {
    const m2 = compact.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!m2) return null;
    y = m2[1];
    m = m2[2].padStart(2, "0");
    d = m2[3].padStart(2, "0");
  }

  if (!y || !m || !d) return null;
  return `${y}.${m}.${d} 업데이트`;
}

export function pickDataReferenceDateFromRow(row: Record<string, unknown>): string | undefined {
  const keys = ["dataReferenceDate", "데이터기준일자", "dataStdDt", "DATA_STD_DE"];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const env =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_STORE_DATA_REFERENCE_DATE
      ? process.env.NEXT_PUBLIC_STORE_DATA_REFERENCE_DATE.trim()
      : "";
  if (env) return env;
  return undefined;
}
