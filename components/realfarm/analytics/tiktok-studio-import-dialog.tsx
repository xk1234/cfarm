"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconBrandTiktok,
  IconCheck,
  IconExternalLink,
  IconLoader2,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  connectTikTokStudioCompanion,
  type TikTokStudioCompanionConfig,
} from "@/lib/tiktok-studio-companion"
import type {
  TikTokStudioImportRecord,
  TikTokStudioSection,
} from "@/lib/tiktok-studio-analytics"
import { cn } from "@/lib/utils"

type StartResponse = {
  import: TikTokStudioImportRecord
  companion: TikTokStudioCompanionConfig
}

export function TikTokStudioImportDialog({
  postId,
  onClose,
  onLinked,
}: {
  postId: string
  onClose: () => void
  onLinked: () => void
}) {
  const [record, setRecord] = useState<TikTokStudioImportRecord | null>(null)
  const [companion, setCompanion] =
    useState<TikTokStudioCompanionConfig | null>(null)
  const [starting, setStarting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const notifiedLinked = useRef(false)

  useEffect(() => {
    if (!record || record.status === "linked" || record.status === "expired") {
      return
    }
    const timer = window.setInterval(() => {
      void fetchJsonWithTimeout<{ import: TikTokStudioImportRecord }>(
        `/api/tiktok-studio-analytics?importId=${encodeURIComponent(record.id)}`,
        { timeoutMs: 15_000, toastOnError: false }
      )
        .then((result) => setRecord(result.import))
        .catch(() => undefined)
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [record])

  useEffect(() => {
    if (record?.status === "linked" && !notifiedLinked.current) {
      notifiedLinked.current = true
      onLinked()
    }
  }, [record, onLinked])

  async function start() {
    setStarting(true)
    try {
      const result = await fetchJsonWithTimeout<StartResponse>(
        "/api/tiktok-studio-analytics",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", postId }),
        }
      )
      setRecord(result.import)
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
      toast.success("Chrome companion connected; capture started")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Chrome companion not detected"
      )
    } finally {
      setConnecting(false)
    }
  }

  const captured = new Set(record?.capturedSections ?? [])
  const ready = captured.has("overview")

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        accessibleTitle="Import TikTok Studio analytics"
        className="max-h-[calc(100dvh-2rem)] max-w-[760px] overflow-y-auto"
      >
        <AppModalHeader
          title="Import TikTok Studio analytics"
          description="Capture the private Studio metrics from your logged-in Chrome session."
          onClose={onClose}
        />
        <div className="p-5 sm:p-6">
          {!record ? (
            <div className="rounded-[14px] border border-app-panel-border bg-app-surface-subtle p-5">
              <div className="flex size-10 items-center justify-center rounded-[11px] bg-black text-white">
                <IconBrandTiktok className="size-5" />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-app-text">
                Pair this LumenClip post with TikTok Studio
              </h3>
              <p className="mt-2 max-w-[580px] text-[12px] leading-5 font-medium text-app-muted-text">
                The Chrome companion reads the analytics responses already
                loaded by TikTok Studio. It does not read cookies, passwords, or
                browser storage.
              </p>
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
                Start automatic capture
              </Button>
            </div>
          ) : (
            <>
              <ol className="grid gap-3 sm:grid-cols-3">
                <Step
                  number="1"
                  title="Connect Chrome"
                  complete={captured.size > 0}
                >
                  LumenClip connects directly to the installed companion. No
                  code is required.
                </Step>
                <Step number="2" title="Load Studio tabs" complete={ready}>
                  Refresh Overview, then open Viewers and Engagement for the
                  fullest report.
                </Step>
                <Step
                  number="3"
                  title="Save automatically"
                  complete={record.status === "linked"}
                >
                  Each validated capture is attached to this post immediately.
                </Step>
              </ol>

              <div className="mt-5 rounded-[14px] border border-app-panel-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-app-text">
                      Chrome companion
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-app-text-faint">
                      Connected once; future pending captures are discovered
                      automatically.
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="softControl" size="compact" asChild>
                    <a href={record.studioUrl} target="_blank" rel="noreferrer">
                      Open TikTok Studio
                      <IconExternalLink className="size-3.5" />
                    </a>
                  </Button>
                  <a
                    href="/downloads/lumenclip-tiktok-studio-analytics.zip"
                    download
                    className="lc-focus-ring inline-flex items-center rounded-[8px] px-2.5 text-[10px] font-semibold text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
                  >
                    Download Chrome companion
                  </a>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-semibold text-app-text">
                  Captured sections
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(["overview", "viewers", "engagement"] as const).map(
                    (section) => (
                      <CaptureSection
                        key={section}
                        section={section}
                        captured={captured.has(section)}
                      />
                    )
                  )}
                </div>
                <p className="mt-3 text-[10px] leading-4 font-medium text-app-text-faint">
                  Overview is required. Viewers and Engagement are optional and
                  enrich the same saved snapshot. The page updates automatically
                  as Chrome captures each tab.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-app-panel-border pt-5">
                <div className="text-[10px] font-medium text-app-muted-text">
                  {record.status === "linked"
                    ? "Snapshot saved automatically."
                    : ready
                      ? "Overview captured. Saving automatically…"
                      : "Waiting for the TikTok Studio Overview tab…"}
                </div>
              </div>
            </>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function Step({
  number,
  title,
  complete,
  children,
}: {
  number: string
  title: string
  complete: boolean
  children: React.ReactNode
}) {
  return (
    <li className="list-none rounded-[12px] bg-app-surface-subtle p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full text-[9px] font-bold",
            complete
              ? "bg-emerald-600 text-white"
              : "bg-app-strong text-app-on-strong"
          )}
        >
          {complete ? <IconCheck className="size-3" /> : number}
        </span>
        <span className="text-[11px] font-semibold text-app-text">{title}</span>
      </div>
      <p className="mt-2 text-[10px] leading-4 font-medium text-app-muted-text">
        {children}
      </p>
    </li>
  )
}

function CaptureSection({
  section,
  captured,
}: {
  section: TikTokStudioSection
  captured: boolean
}) {
  const labels: Record<TikTokStudioSection, string> = {
    overview: "Overview + slide retention",
    viewers: "Viewer demographics",
    engagement: "Likes by slide",
  }
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[10px] border px-3 py-2.5 text-[10px] font-semibold",
        captured
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-app-panel-border bg-app-surface text-app-text-faint"
      )}
    >
      {captured ? (
        <IconCheck className="size-3.5" />
      ) : (
        <span className="size-3.5 rounded-full border border-current opacity-40" />
      )}
      {labels[section]}
    </div>
  )
}
