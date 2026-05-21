import { STORE_SHEET_VIRTUAL_ROW_EST_PX } from "@/components/BottomSheetList";

export const REGION_LIST_SKELETON_ROW_COUNT = 8;

export function RegionStoreListRowSkeletons({
  count = REGION_LIST_SKELETON_ROW_COUNT
}: {
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`region-list-skel-${i}`}
          className="flex flex-col justify-center px-2"
          style={{ height: STORE_SHEET_VIRTUAL_ROW_EST_PX }}
          aria-hidden
        >
          <div className="flex flex-col gap-3 px-2">
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-[72%] animate-pulse rounded-[6px] bg-neutral-200" />
              <div className="h-[14px] w-[48%] animate-pulse rounded-[6px] bg-neutral-100" />
            </div>
            <div className="flex gap-1">
              <div className="h-6 w-[60px] animate-pulse rounded-full bg-neutral-100" />
              <div className="h-6 w-[72px] animate-pulse rounded-full bg-neutral-100" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** 라우트 transition·Suspense fallback — 실제 RegionStoreListClient 풀스크린 리스트와 동일한 골격 */
export default function RegionStoreListSkeleton() {
  return (
    <main
      className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-bg-canvas"
      aria-busy="true"
      aria-label="지역 판매처 불러오는 중"
    >
      <div className="fixed inset-y-0 left-0 right-0 z-0 flex h-[100dvh] justify-center">
        <div className="relative h-full min-h-0 w-full max-w-md bg-[#e8ebef]" aria-hidden />
      </div>

      <div className="pointer-events-auto fixed inset-0 z-[60] flex justify-center bg-white">
        <div className="relative flex h-[100dvh] w-full max-w-md flex-col bg-white pt-[env(safe-area-inset-top,0px)]">
          <header className="flex shrink-0 items-center gap-1 pr-2">
            <div className="mx-2 size-12 shrink-0 animate-pulse rounded-lg bg-neutral-100" aria-hidden />
            <span className="min-w-0 flex-1" aria-hidden />
            <div className="mx-2 size-12 shrink-0 animate-pulse rounded-lg bg-neutral-100" aria-hidden />
          </header>

          <div className="flex min-h-0 flex-1 flex-col px-4 pt-[4px]">
            <div className="shrink-0 space-y-3 py-1">
              <div className="h-6 w-[40%] animate-pulse rounded-[6px] bg-neutral-200" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-10 w-[120px] animate-pulse rounded-[8px] bg-neutral-200" aria-hidden />
                <div className="h-5 w-[45%] animate-pulse rounded-[6px] bg-neutral-100" aria-hidden />
              </div>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-hidden px-0">
              <div className="shrink-0 pb-2 pt-4">
                <div
                  className="ml-2 h-[14px] w-[72px] animate-pulse rounded-[6px] bg-neutral-200"
                  aria-hidden
                />
              </div>
              <RegionStoreListRowSkeletons />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
