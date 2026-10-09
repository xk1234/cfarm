"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { IconPhoto, IconPlus } from "@tabler/icons-react"

import { listRenders, type RenderListItem } from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"

import { RenderStatusBadge, formatDateTime } from "./render-status"

export function RendersView({
  onNewRender,
  onOpenRender,
}: {
  onNewRender: () => void
  onOpenRender: (id: string) => void
}) {
  const renders = useInfiniteQuery({
    queryKey: ["renders"],
    queryFn: ({ pageParam }) => listRenders({ cursor: pageParam, limit: 24 }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some((item) => item.status === "queued" || item.status === "rendering")
      )
        ? 4000
        : false,
  })
  const items = renders.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-app-text">Renders</h1>
        <Button
          type="button"
          variant="action"
          size="appDefault"
          className="self-start sm:self-auto"
          onClick={onNewRender}
        >
          <IconPlus />
          New render
        </Button>
      </header>

      {renders.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="aspect-[9/16] animate-pulse rounded-xl bg-app-surface-subtle" />
          ))}
        </div>
      ) : renders.error ? (
        <p role="alert" className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted">
          Renders could not be loaded.
        </p>
      ) : items.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-app-panel-border px-6 py-16 text-center">
          <IconPhoto className="size-6 text-app-muted-text" />
          <p className="text-sm font-semibold text-app-text">No renders yet</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <RenderCard item={item} onOpen={() => onOpenRender(item.id)} />
            </li>
          ))}
        </ul>
      )}

      {renders.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="softControl"
            size="appDefault"
            className="min-w-[120px]"
            disabled={renders.isFetchingNextPage}
            onClick={() => void renders.fetchNextPage()}
          >
            {renders.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function RenderCard({ item, onOpen }: { item: RenderListItem; onOpen: () => void }) {
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : "9 / 16"
  return (
    <button type="button" onClick={onOpen} className="lc-focus-ring group flex w-full flex-col gap-2 rounded-xl text-left">
      <span
        className="relative grid w-full place-items-center overflow-hidden rounded-xl border border-app-panel-border bg-app-surface-subtle transition group-hover:border-app-action"
        style={{ aspectRatio: ratio }}
      >
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-checked render file
          <img src={item.coverUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <IconPhoto className="size-6 text-app-muted-text" />
        )}
        <RenderStatusBadge status={item.status} className="absolute top-2 left-2" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">
          {item.title || "Untitled render"}
        </span>
        <span className="block truncate text-xs text-app-muted-text">
          {[item.slideCount ? `${item.slideCount} slides` : null, formatDateTime(item.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </button>
  )
}
