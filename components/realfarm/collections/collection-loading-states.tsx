import { SkeletonBlock } from "@/components/ui/loading-skeleton"

export function CollectionGridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading collections"
      aria-busy="true"
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5"
    >
      {Array.from({ length: 14 }, (_, index) => (
        <div
          key={index}
          className="min-w-0 overflow-hidden rounded-[8px] border border-app-panel-border bg-app-surface"
        >
          <SkeletonBlock className="h-[170px] w-full rounded-none" />
          <div className="px-4 py-4">
            <SkeletonBlock className="h-3.5 w-4/5 rounded" />
            <SkeletonBlock className="mt-2 h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CollectionTableSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading collections"
      aria-busy="true"
      className="overflow-hidden rounded-[8px] border border-app-panel-border bg-app-surface"
    >
      <SkeletonBlock className="h-11 w-full rounded-none" />
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(220px,1.6fr)_120px_110px_160px_210px] gap-4 border-t border-app-panel-border px-4 py-4"
        >
          {Array.from({ length: 5 }, (_, cellIndex) => (
            <SkeletonBlock key={cellIndex} className="h-3 w-full rounded" />
          ))}
        </div>
      ))}
    </div>
  )
}
