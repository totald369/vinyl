/**
 * 지역 import 등 오프라인 스크립트에서 activity 를 기록합니다.
 *
 *   npx tsx scripts/appendActivityCli.ts region 화순군
 *   npx tsx scripts/appendActivityCli.ts region 부안군 정읍시 여수시
 *   npx tsx scripts/appendActivityCli.ts store-update 강남구
 *   npx tsx scripts/appendActivityCli.ts user-report 3
 */

import { recordRegionDataAdded, recordStoreInfoUpdated, recordUserReportsReflected } from "../lib/activityFeedWriter";

function usage(): never {
  console.error(`Usage:
  tsx scripts/appendActivityCli.ts region <지역명...>
  tsx scripts/appendActivityCli.ts store-update <지역명...> [--count N]
  tsx scripts/appendActivityCli.ts user-report <건수>`);
  process.exit(1);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();

  if (command === "region") {
    const regions = rest.filter((arg) => !arg.startsWith("--"));
    if (regions.length === 0) usage();
    const item = recordRegionDataAdded(regions);
    console.log(item ? `[activity] REGION_DATA_ADDED (${regions.join(", ")})` : "[activity] skipped");
    return;
  }

  if (command === "store-update") {
    const regions: string[] = [];
    let count: number | undefined;
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!;
      if (arg === "--count") {
        count = Number(rest[++i]);
        continue;
      }
      if (!arg.startsWith("--")) regions.push(arg);
    }
    if (regions.length === 0) usage();
    const item = recordStoreInfoUpdated(regions, count);
    console.log(item ? `[activity] STORE_INFO_UPDATED (${regions.join(", ")})` : "[activity] skipped");
    return;
  }

  if (command === "user-report") {
    const count = Number(rest[0]);
    if (!Number.isFinite(count) || count <= 0) usage();
    const item = recordUserReportsReflected(count);
    console.log(item ? `[activity] USER_REPORT_REFLECTED × ${count}` : "[activity] skipped");
    return;
  }

  usage();
}

main();
