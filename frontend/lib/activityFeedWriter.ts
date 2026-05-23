import fs from "fs";
import path from "path";
import type { ActivityItem, ActivityType } from "@/lib/activityFeed";
import type { RawReportRow } from "@/lib/reportStores";

const ACTIVITIES_FILE = "activities.json";
const REFLECTED_REPORTS_STATE_FILE = "_activity_reflected_reports.json";
const MAX_STORED_ACTIVITIES = 200;

export type ActivityInput = Omit<ActivityItem, "id"> & { id?: string };

export type MergeActivityResult = {
  newStoreReportIds: string[];
  editRequestReportIds: string[];
  editRegions: string[];
};

function getDataDir(root = process.cwd()): string {
  return path.join(root, "public", "data");
}

function getActivitiesPath(root = process.cwd()): string {
  return path.join(getDataDir(root), ACTIVITIES_FILE);
}

function getReflectedReportsStatePath(root = process.cwd()): string {
  return path.join(getDataDir(root), REFLECTED_REPORTS_STATE_FILE);
}

export function readActivitiesFromDisk(root = process.cwd()): ActivityItem[] {
  const filePath = getActivitiesPath(root);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (row): row is ActivityItem =>
        typeof row === "object" &&
        row != null &&
        typeof (row as ActivityItem).id === "string" &&
        typeof (row as ActivityItem).type === "string" &&
        typeof (row as ActivityItem).createdAt === "string"
    );
  } catch {
    return [];
  }
}

function writeActivitiesToDisk(items: ActivityItem[], root = process.cwd()): void {
  const dataDir = getDataDir(root);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(getActivitiesPath(root), `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function loadReflectedReportIds(root = process.cwd()): Set<string> {
  const filePath = getReflectedReportsStatePath(root);
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return new Set();
    const ids = (raw as { reportIds?: unknown }).reportIds;
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

function saveReflectedReportIds(ids: Set<string>, root = process.cwd()): void {
  const dataDir = getDataDir(root);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    getReflectedReportsStatePath(root),
    `${JSON.stringify({ reportIds: [...ids].sort() }, null, 2)}\n`,
    "utf8"
  );
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function generateActivityId(type: ActivityType, date: string): string {
  const slug = type.toLowerCase().replace(/_/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `act-${date}-${slug}-${suffix}`;
}

function uniqueRegions(regions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const region of regions) {
    const trimmed = region.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** 도로명·지번 주소에서 UI용 지역명(구/시/군) 추출 */
export function extractRegionLabel(address: string | null | undefined): string | null {
  const s = (address ?? "").trim();
  if (!s) return null;

  const gu = s.match(/([가-힣]{2,8}구)(?:\s|$|[0-9])/);
  if (gu) return gu[1] ?? null;

  const si = s.match(/([가-힣]{2,8}시)(?:\s|$|[0-9])/);
  if (si) return si[1] ?? null;

  const gun = s.match(/([가-힣]{2,8}군)(?:\s|$|[0-9])/);
  if (gun) return gun[1] ?? null;

  return null;
}

export function extractRegionFromReport(row: RawReportRow): string | null {
  return (
    extractRegionLabel(row.road_address ?? undefined) ??
    extractRegionLabel(row.detail_address ?? undefined) ??
    extractRegionLabel(row.name ?? undefined)
  );
}

function isApprovedReport(row: RawReportRow): boolean {
  return (row.status ?? "").toLowerCase() === "approved";
}

/** mergeStoreSources 에 실제 반영 가능한 approved 제보만 */
export function isReportReflectable(row: RawReportRow): boolean {
  if (!isApprovedReport(row)) return false;

  const reportType = (row.report_type ?? "new_store").trim();
  if (reportType === "edit_request") {
    const sid = row.store_id;
    return sid != null && String(sid).trim() !== "";
  }

  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function ensureReflectedReportStateInitialized(rows: RawReportRow[], root = process.cwd()): Set<string> {
  const statePath = getReflectedReportsStatePath(root);
  if (fs.existsSync(statePath)) return loadReflectedReportIds(root);

  const ids = new Set<string>();
  for (const row of rows) {
    if (row?.id && isReportReflectable(row)) ids.add(row.id);
  }
  saveReflectedReportIds(ids, root);
  console.log(
    `[activity] initialized reflected report state (${ids.size} existing approved reports, no activities created)`
  );
  return ids;
}

export function prependActivity(input: ActivityInput, root = process.cwd()): ActivityItem {
  const createdAt = input.createdAt.slice(0, 10);
  const item: ActivityItem = {
    ...input,
    id: input.id ?? generateActivityId(input.type, createdAt),
    createdAt
  };

  const existing = readActivitiesFromDisk(root);
  const next = [item, ...existing].slice(0, MAX_STORED_ACTIVITIES);
  writeActivitiesToDisk(next, root);
  return item;
}

export function recordUserReportsReflected(count: number, createdAt = todayIsoDate(), root = process.cwd()): ActivityItem | null {
  if (count <= 0) return null;
  return prependActivity(
    {
      type: "USER_REPORT_REFLECTED",
      createdAt,
      count
    },
    root
  );
}

export function recordStoreInfoUpdated(
  regions: string[],
  affectedCount?: number,
  createdAt = todayIsoDate(),
  root = process.cwd()
): ActivityItem | null {
  const unique = uniqueRegions(regions);
  if (unique.length === 0) return null;
  return prependActivity(
    {
      type: "STORE_INFO_UPDATED",
      createdAt,
      affectedRegions: unique,
      affectedCount: affectedCount ?? unique.length
    },
    root
  );
}

export function recordRegionDataAdded(
  regions: string[],
  createdAt = todayIsoDate(),
  root = process.cwd()
): ActivityItem | null {
  const unique = uniqueRegions(regions);
  if (unique.length === 0) return null;
  return prependActivity(
    {
      type: "REGION_DATA_ADDED",
      createdAt,
      affectedRegions: unique
    },
    root
  );
}

export function syncReportActivitiesFromRows(rows: RawReportRow[], root = process.cwd()): void {
  const reflected = ensureReflectedReportStateInitialized(rows, root);
  const newStoreIds: string[] = [];
  const editRegions: string[] = [];

  for (const row of rows) {
    if (!row?.id || reflected.has(row.id)) continue;
    if (!isReportReflectable(row)) continue;

    const reportType = (row.report_type ?? "new_store").trim();
    if (reportType === "edit_request") {
      const region = extractRegionFromReport(row);
      if (region) editRegions.push(region);
      reflected.add(row.id);
      continue;
    }

    newStoreIds.push(row.id);
    reflected.add(row.id);
  }

  if (newStoreIds.length > 0) {
    recordUserReportsReflected(newStoreIds.length, todayIsoDate(), root);
    console.log(`[activity] USER_REPORT_REFLECTED × ${newStoreIds.length}`);
  }
  if (editRegions.length > 0) {
    recordStoreInfoUpdated(editRegions, editRegions.length, todayIsoDate(), root);
    console.log(`[activity] STORE_INFO_UPDATED (${uniqueRegions(editRegions).join(", ")})`);
  }

  if (newStoreIds.length > 0 || editRegions.length > 0) {
    saveReflectedReportIds(reflected, root);
  }
}

export function recordActivitiesFromMergeResult(result: MergeActivityResult, root = process.cwd()): void {
  const reflected = loadReflectedReportIds(root);
  const pendingNewStore = result.newStoreReportIds.filter((id) => id && !reflected.has(id));
  const pendingEdit = result.editRequestReportIds.filter((id) => id && !reflected.has(id));
  const editRegions = uniqueRegions(result.editRegions);

  if (pendingNewStore.length > 0) {
    recordUserReportsReflected(pendingNewStore.length, todayIsoDate(), root);
    for (const id of pendingNewStore) reflected.add(id);
    console.log(`[activity] USER_REPORT_REFLECTED × ${pendingNewStore.length} (merge)`);
  }

  if (pendingEdit.length > 0 && editRegions.length > 0) {
    recordStoreInfoUpdated(editRegions, pendingEdit.length, todayIsoDate(), root);
    for (const id of pendingEdit) reflected.add(id);
    console.log(`[activity] STORE_INFO_UPDATED (${editRegions.join(", ")}) (merge)`);
  }

  if (pendingNewStore.length > 0 || pendingEdit.length > 0) {
    saveReflectedReportIds(reflected, root);
  }
}
