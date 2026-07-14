import Skeleton from "react-loading-skeleton"

import { cn } from "@/lib/utils"

const skeletonColors = {
  baseColor: "#e7e7e1",
  highlightColor: "#f7f7f3",
}

export function SkeletonBlock({
  className,
  circle = false,
}: {
  className: string
  circle?: boolean
}) {
  return (
    <span className={cn("block overflow-hidden", className)} aria-hidden="true">
      <Skeleton
        {...skeletonColors}
        circle={circle}
        borderRadius="inherit"
        height="100%"
        containerClassName="block h-full leading-none"
      />
    </span>
  )
}

export function CardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-[9px] border border-app-panel-border bg-white p-4"
        >
          <SkeletonBlock className="h-10 w-10 rounded-lg" />
          <SkeletonBlock className="mt-4 h-4 w-3/5 rounded" />
          <SkeletonBlock className="mt-3 h-3 w-full rounded" />
          <SkeletonBlock className="mt-2 h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      className={cn("divide-y divide-app-panel-border", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-4">
          <SkeletonBlock className="size-10 shrink-0 rounded-full" circle />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-3.5 w-2/5 rounded" />
            <SkeletonBlock className="mt-2 h-3 w-1/4 rounded" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function AccountGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading accounts"
      aria-busy="true"
      className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-[8px] border border-app-panel-border bg-white p-3"
        >
          <SkeletonBlock className="mx-auto size-10 rounded-full" circle />
          <SkeletonBlock className="mx-auto mt-3 h-3 w-4/5 rounded" />
          <SkeletonBlock className="mx-auto mt-2 h-2.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  )
}
