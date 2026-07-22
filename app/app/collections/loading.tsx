import { SkeletonBlock } from "@/components/ui/loading-skeleton"

export default function CollectionsLoading() {
  return (
    <main className="min-h-svh bg-[#f7f7fa] px-4 py-5 sm:px-7">
      <div className="mx-auto max-w-[1380px] space-y-5">
        <SkeletonBlock className="h-12 w-full" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonBlock key={index} className="aspect-square" />
          ))}
        </div>
      </div>
    </main>
  )
}
