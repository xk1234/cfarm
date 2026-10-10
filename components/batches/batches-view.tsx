"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { IconPlus, IconStack2 } from "@tabler/icons-react"

import {
  listBatches,
  type BatchSummaryView,
} from "@/components/realfarm/api-client"
import { formatDateTime } from "@/components/render/render-status"
import { Button } from "@/components/ui/button"

import { BatchStatusBadge, countsSummary, isBatchActive } from "./batch-status"

export function BatchesView({
  onNewBatch,
  onOpenBatch,
}: {
  onNewBatch: () => void
  onOpenBatch: (id: string) => void
}) {
  const batches = useInfiniteQuery({
    queryKey: ["batches"],
    queryFn: ({ pageParam }) => listBatches({ cursor: pageParam, limit: 25 }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some((item) => isBatchActive(item.status))
      )
        ? 4000
        : false,
  })
  const items = batches.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-app-text">
          Batches
        </h1>
        <Button
          type="button"
          variant="action"
          size="appDefault"
          className="self-start sm:self-auto"
          onClick={onNewBatch}
        >
          <IconPlus />
          New batch
        </Button>
      </header>

      {batches.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-[72px] animate-pulse rounded-xl bg-app-surface-subtle"
            />
          ))}
        </div>
      ) : batches.error ? (
        <p
          role="alert"
          className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted"
        >
          Batches could not be loaded.
        </p>
      ) : items.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-app-panel-border px-6 py-16 text-center">
          <IconStack2 className="size-6 text-app-muted-text" />
          <p className="text-sm font-semibold text-app-text">No batches yet</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((batch) => (
            <li key={batch.id}>
              <BatchRow batch={batch} onOpen={() => onOpenBatch(batch.id)} />
            </li>
          ))}
        </ul>
      )}

      {batches.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="softControl"
            size="appDefault"
            className="min-w-[120px]"
            disabled={batches.isFetchingNextPage}
            onClick={() => void batches.fetchNextPage()}
          >
            {batches.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function BatchRow({
  batch,
  onOpen,
}: {
  batch: BatchSummaryView
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-focus-ring flex w-full flex-col gap-2 rounded-xl border border-app-panel-border bg-app-surface px-4 py-3 text-left transition hover:border-app-action sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">
          {batch.name}
        </span>
        <span className="block truncate text-xs text-app-muted-text">
          {[
            countsSummary(batch.counts),
            `${batch.accountIds.length} account${batch.accountIds.length === 1 ? "" : "s"}`,
            batch.mode === "draft" ? "TikTok drafts" : null,
            formatDateTime(batch.createdAt),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <BatchStatusBadge
        status={batch.status}
        className="self-start sm:self-auto"
      />
    </button>
  )
}
