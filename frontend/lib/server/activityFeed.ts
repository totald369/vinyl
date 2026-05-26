import type { ActivityItem } from "@/lib/activityFeed";
import { readActivitiesFromDisk } from "@/lib/activityFeedWriter";

/** activities.json 은 수 KB — 요청마다 디스크에서 읽어 배포 직후에도 패널이 즉시 반영되게 한다. */
export function readActivityItems(): Promise<ActivityItem[]> {
  return Promise.resolve(readActivitiesFromDisk(process.cwd()));
}
