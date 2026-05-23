import type { ActivityItem } from "@/lib/activityFeed";
import { readActivitiesFromDisk } from "@/lib/activityFeedWriter";

export function readActivityItems(): ActivityItem[] {
  return readActivitiesFromDisk(process.cwd());
}
