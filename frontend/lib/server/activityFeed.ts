import { unstable_cache } from "next/cache";
import type { ActivityItem } from "@/lib/activityFeed";
import { readActivitiesFromDisk } from "@/lib/activityFeedWriter";

const getCachedActivityItems = unstable_cache(
  async () => readActivitiesFromDisk(process.cwd()),
  ["activity-feed-items-v1"],
  { revalidate: 600 }
);

export function readActivityItems(): Promise<ActivityItem[]> {
  return getCachedActivityItems();
}
