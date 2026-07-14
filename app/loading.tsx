import {
  CardGridSkeleton,
  SkeletonBlock,
} from "@/components/ui/loading-skeleton"

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      aria-busy="true"
      className="min-h-svh bg-[#f7f7fa] p-6"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="flex items-center gap-4 border-b border-app-panel-border pb-5">
          <SkeletonBlock className="size-10 rounded-[9px]" />
          <SkeletonBlock className="h-5 w-32 rounded" />
          <SkeletonBlock className="ml-auto h-9 w-28 rounded-[7px]" />
        </div>
        <SkeletonBlock className="mt-10 h-9 w-72 rounded" />
        <SkeletonBlock className="mt-3 h-4 w-[420px] max-w-full rounded" />
        <CardGridSkeleton count={8} className="mt-8 lg:grid-cols-4" />
      </div>
    </div>
  )
}
