"use client"

import { useEffect, useRef, useState } from "react"
import { IconBrandTiktok, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  connectTikTokStudioCompanion,
  type TikTokStudioCompanionConfig,
} from "@/lib/tiktok-studio-companion"
import type {
  TikTokStudioBatchMode,
  TikTokStudioBatchView,
} from "@/lib/tiktok-studio-analytics"

type StartBatchResponse = {
  batch: TikTokStudioBatchView
  companion: TikTokStudioCompanionConfig
}

export function TikTokStudioBatchDialog({
  integrationIds,
  onClose,
  onLinked,
}: {
  integrationIds: string[]
  onClose: () => void
  onLinked: () => void
}) {
  const [mode, setMode] = useState<TikTokStudioBatchMode>("new")
  const [batch, setBatch] = useState<TikTokStudioBatchView | null>(null)
  const [companion, setCompanion] =
    useState<TikTokStudioCompanionConfig | null>(null)
  const [starting, setStarting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const notifiedLinked = useRef(false)

  useEffect(() => {
    if (!batch || batch.status === "complete" || batch.status === "expired") {
      return
    }
    const timer = window.setInterval(() => {
      void fetchJsonWithTimeout<{ batch: TikTokStudioBatchView }>(
        `/api/tiktok-studio-analytics?batchId=${encodeURIComponent(batch.id)}`,
        { timeoutMs: 15_000, toastOnError: false }
      )
        .then((result) => setBatch(result.batch))
        .catch(() => undefined)
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [batch])

  useEffect(() => {
    if (batch && batch.counts.linked > 0 && !notifiedLinked.current) {
      notifiedLinked.current = true
      onLinked()
    }
  }, [batch, onLinked])

  async function start() {
    setStarting(true)
    try {
      const result = await fetchJsonWithTimeout<StartBatchResponse>(
        "/api/tiktok-studio-analytics",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "start_batch",
            integrationIds,
            mode,
            recentDays: mode === "recent" ? 90 : undefined,
          }),
        }
      )
      setBatch(result.batch)
      setCompanion(result.companion)
      await connect(result.companion)
    } finally {
      setStarting(false)
    }
  }

  async function connect(config = companion) {
    if (!config) return
    setConnecting(true)
    try {
      await connectTikTokStudioCompanion(config, { autoStart: true })
      toast.success("Chrome companion connected; analytics sync started")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Chrome companion not detected"
      )
    } finally {
      setConnecting(false)
    }
  }

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        accessibleTitle="Sync TikTok Studio"
        className="max-h-[calc(100dvh-2rem)] max-w-[780px] overflow-y-auto"
      >
        <AppModalHeader
          title="Sync TikTok Studio"
          description="Capture every linked post in sequence from your logged-in Chrome session."
          onClose={onClose}
        />
        <div className="p-5 sm:p-6">
          {!batch ? (
            <div className="rounded-[14px] border border-app-panel-border bg-app-surface-subtle p-5">
              <div className="flex size-10 items-center justify-center rounded-[11px] bg-black text-white">
                <IconBrandTiktok className="size-5" />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-app-text">
                Choose which linked posts to sync
              </h3>
              <p className="mt-2 max-w-[600px] text-[12px] leading-5 font-medium text-app-muted-text">
                LumenClip sends the companion an explicit list of linked TikTok
                post IDs. The companion visits each Studio report one at a time
                and never sends cookies or browser storage.
              </p>
              <label className="mt-5 block max-w-[320px]">
                <span className="mb-1.5 block text-[11px] font-semibold text-app-text">
                  Sync scope
                </span>
                <SelectControl
                  aria-label="TikTok Studio sync scope"
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as TikTokStudioBatchMode)
                  }
                >
                  <option value="new">New posts only</option>
                  <option value="recent">Posts from the last 90 days</option>
                  <option value="all">All linked posts</option>
                </SelectControl>
              </label>
              <Button
                className="mt-5"
                variant="action"
                size="appDefault"
                onClick={() => void start()}
                disabled={starting}
              >
                {starting ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconBrandTiktok className="size-4" />
                )}
                Create account sync
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <ProgressCard label="Linked posts" value={batch.counts.total} />
                <ProgressCard
                  label="Captured"
                  value={batch.counts.captured}
                  detail={`of ${batch.counts.total}`}
                />
                <ProgressCard
                  label="Saved to LumenClip"
                  value={batch.counts.linked}
                  detail={`of ${batch.counts.total}`}
                />
              </div>

              <div className="mt-5 rounded-[14px] border border-app-panel-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-app-text">
                      Chrome companion
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-app-text-faint">
                      Connected once, then pending syncs start automatically.
                    </div>
                  </div>
                  <Button
                    variant="softControl"
                    size="compact"
                    onClick={() => void connect()}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconBrandTiktok className="size-4" />
                    )}
                    Reconnect
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] leading-4 font-medium text-app-muted-text">
                  <a
                    href="/downloads/lumenclip-tiktok-studio-analytics.zip"
                    download
                    className="lc-focus-ring rounded-[7px] font-semibold text-app-text hover:underline"
                  >
                    Download Chrome companion
                  </a>
                  <span>
                    Install or reload version 1.2.0 once. No pairing codes are
                    required.
                  </span>
                </div>
              </div>

              <div className="mt-5 max-h-56 overflow-y-auto rounded-[12px] border border-app-panel-border">
                {batch.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 border-b border-app-panel-border px-4 py-3 last:border-b-0"
                  >
                    <span className="truncate font-mono text-[10px] text-app-muted-text">
                      {item.externalPostId}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-app-text">
                      {item.status === "linked"
                        ? "Linked"
                        : item.capturedSections.includes("overview")
                          ? `${item.capturedSections.length}/3 captured`
                          : "Waiting"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-app-panel-border pt-5">
                <p className="text-[10px] leading-4 font-medium text-app-muted-text">
                  {batch.status === "complete"
                    ? "Every captured snapshot was saved automatically."
                    : batch.counts.captured > 0
                      ? "Captured posts are being saved automatically. Missing sections remain retryable."
                      : "Waiting for the Chrome companion to capture Studio reports…"}
                </p>
              </div>
            </>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function ProgressCard({
  label,
  value,
  detail,
}: {
  label: string
  value: number
  detail?: string
}) {
  return (
    <div className="rounded-[12px] bg-app-surface-subtle p-4">
      <div className="text-[10px] font-semibold text-app-muted-text">
        {label}
      </div>
      <div className="mt-2 text-[24px] leading-none font-semibold tracking-[-0.04em] text-app-text tabular-nums">
        {value}
        {detail ? (
          <span className="ml-1.5 text-[10px] tracking-normal text-app-text-faint">
            {detail}
          </span>
        ) : null}
      </div>
    </div>
  )
}
