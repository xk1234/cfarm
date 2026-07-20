import { SkeletonBlock } from "@/components/ui/loading-skeleton"

export default function PostAnalyticsLoading() {
  return (
    <main className="min-h-screen bg-[#f8f7fb] px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1380px] space-y-5">
        <SkeletonBlock className="h-9 w-36 rounded-lg" />
        <SkeletonBlock className="h-[360px] rounded-[20px]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock key={index} className="h-28 rounded-[15px]" />
          ))}
        </div>
        <SkeletonBlock className="h-[410px] rounded-[18px]" />
      </div>
    </main>
  )
}
