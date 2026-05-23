import fs from "fs";
import { recordActivitiesFromMergeResult, type MergeActivityResult } from "../lib/activityFeedWriter";

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/syncActivitiesFromMerge.ts <merge-result.json>");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MergeActivityResult;
  recordActivitiesFromMergeResult({
    newStoreReportIds: Array.isArray(raw.newStoreReportIds) ? raw.newStoreReportIds : [],
    editRequestReportIds: Array.isArray(raw.editRequestReportIds) ? raw.editRequestReportIds : [],
    editRegions: Array.isArray(raw.editRegions) ? raw.editRegions : []
  });
}

main();
