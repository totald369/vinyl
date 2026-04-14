import { getMergedStores } from "@/lib/server/storeDataset";

export function getMergedStoreById(id: string) {
  const trimmed = id?.trim() ?? "";
  if (!trimmed) return undefined;
  return getMergedStores().find((s) => s.id === trimmed);
}
