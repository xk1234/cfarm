import { SkeletonBlock } from "@/components/ui/loading-skeleton"

export default function AnalyticsLoading() {
  return (
    <main className="min-h-svh bg-[#f7f7fa] px-4 py-5 sm:px-7">
      <div className="mx-auto max-w-[1380px] min-w-0 space-y-5 overflow-hidden">
        <SkeletonBlock className="h-12 max-w-full" />
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
          <SkeletonBlock className="h-32 max-w-full min-w-0" />
          <SkeletonBlock className="h-32 max-w-full min-w-0" />
          <SkeletonBlock className="h-32 max-w-full min-w-0" />
        </div>
        <SkeletonBlock className="h-[420px] max-w-full" />
      </div>
    </main>
  )
}
