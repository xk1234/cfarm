import { SkeletonBlock } from "@/components/ui/loading-skeleton"

export default function AnalyticsLoading() {
  return (
    <main className="min-h-svh bg-[#f7f7fa] px-4 py-5 sm:px-7">
      <div className="mx-auto max-w-[1380px] space-y-5">
        <SkeletonBlock className="h-12 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
        </div>
        <SkeletonBlock className="h-[420px]" />
      </div>
    </main>
  )
}
