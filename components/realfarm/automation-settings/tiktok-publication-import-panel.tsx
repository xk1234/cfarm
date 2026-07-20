"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  IconAlertTriangle,
  IconBrandTiktok,
  IconCheck,
  IconExternalLink,
  IconLoader2,
  IconRestore,
  IconSearch,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type {
  TikTokImportPreview,
  TikTokPostMatch,
} from "@/lib/tiktok-publication-import"
import { cn } from "@/lib/utils"
import { usePostFastIntegrations } from "@/components/realfarm/social-account-selection"
import { socialAccountShortName } from "@/components/realfarm/social-platform"

import type { AutomationRunApiRecord } from "./types"
import { SettingsPage } from "./settings-layout"

const acceptsTikTok = (provider: string) => provider.startsWith("tiktok")

export function TikTokPublicationImportPanel({
  automationId,
  onRunsImported,
}: {
  automationId: string
  onRunsImported: (runs: AutomationRunApiRecord[]) => void
}) {
  const [urls, setUrls] = useState("")
  const [operationId, setOperationId] = useState("")
  const [preview, setPreview] = useState<TikTokImportPreview | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [integrationId, setIntegrationId] = useState("")
  const [working, setWorking] = useState(false)
  const { integrations, loading: integrationsLoading } =
    usePostFastIntegrations({ acceptsProvider: acceptsTikTok })
  const selectedIntegrationId =
    integrationId || integrations[0]?.integration_id || ""

  const inspect = useCallback(
    async (id: string) => {
      try {
        const payload = await fetchJsonWithTimeout<{
          preview: TikTokImportPreview
        }>(
          `/api/tiktok-publications?operationId=${encodeURIComponent(id)}&automationId=${encodeURIComponent(automationId)}`,
          { timeoutMs: 120_000, toastOnError: false }
        )
        setPreview(payload.preview)
        if (payload.preview.posts) {
          setSelections((current) => {
            const next = { ...current }
            payload.preview.posts?.forEach((item) => {
              if (item.alreadyLinked || next[item.post.id]) return
              next[item.post.id] = item.recommendedRunId
                ? `run:${item.recommendedRunId}`
                : "recover"
            })
            return next
          })
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Could not inspect TikTok posts"))
      }
    },
    [automationId]
  )

  useEffect(() => {
    if (!operationId || preview?.status === "SUCCEEDED") return
    if (
      preview?.status === "FAILED" ||
      preview?.status === "ABORTED" ||
      preview?.status === "TIMED-OUT"
    ) {
      return
    }
    const timer = window.setTimeout(() => void inspect(operationId), 3_000)
    return () => window.clearTimeout(timer)
  }, [inspect, operationId, preview?.status])

  const pendingPosts = useMemo(
    () => preview?.posts?.filter((item) => !item.alreadyLinked) ?? [],
    [preview]
  )

  async function start() {
    const list = urls
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (list.length === 0) {
      toast.error("Add at least one TikTok photo URL")
      return
    }
    setWorking(true)
    setPreview(null)
    try {
      const payload = await fetchJsonWithTimeout<{
        operation: {
          operationId: string
          status: TikTokImportPreview["status"]
        }
      }>("/api/tiktok-publications", {
        method: "POST",
        timeoutMs: 45_000,
        toastOnError: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", automationId, urls: list }),
      })
      setOperationId(payload.operation.operationId)
      setPreview({
        operationId: payload.operation.operationId,
        status: payload.operation.status,
      })
      await inspect(payload.operation.operationId)
    } catch (error) {
      toast.error(getApiErrorMessage(error, "TikTok inspection failed"))
    } finally {
      setWorking(false)
    }
  }

  async function linkSelected() {
    if (!selectedIntegrationId) {
      toast.error("Connect or choose a TikTok account first")
      return
    }
    if (!preview?.posts || pendingPosts.length === 0) return
    setWorking(true)
    try {
      await fetchJsonWithTimeout("/api/tiktok-publications", {
        method: "POST",
        timeoutMs: 10 * 60_000,
        toastOnError: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link",
          automationId,
          operationId: preview.operationId,
          integrationId: selectedIntegrationId,
          selections: pendingPosts.map((item) => {
            const selection = selections[item.post.id] ?? "recover"
            return selection === "recover"
              ? { postId: item.post.id, recover: true }
              : { postId: item.post.id, runId: selection.replace(/^run:/, "") }
          }),
        }),
      })
      const runPayload = await fetchJsonWithTimeout<{
        runs?: AutomationRunApiRecord[]
      }>(
        `/api/automations/runs?automationId=${encodeURIComponent(automationId)}&limit=100`,
        { toastOnError: false }
      )
      onRunsImported(runPayload.runs ?? [])
      await inspect(preview.operationId)
      toast.success("Published TikTok posts linked")
    } catch (error) {
      toast.error(getApiErrorMessage(error, "TikTok posts were not linked"))
    } finally {
      setWorking(false)
    }
  }

  const terminalError =
    preview && ["FAILED", "ABORTED", "TIMED-OUT"].includes(preview.status)

  return (
    <SettingsPage
      title="Published TikTok posts"
      description="Inspect a photo post, match it to a generated slideshow, and restore missing history before recording it as published. Nothing is linked until you confirm below."
    >
      <section className="py-6">
        <label className="block text-sm font-semibold text-app-text">
          TikTok photo URLs
          <textarea
            className="mt-2 min-h-28 w-full resize-y rounded-lg border border-app-panel-border bg-app-surface px-3 py-2.5 text-sm leading-6 text-app-text outline-none focus:border-app-action focus:ring-3 focus:ring-app-action/15"
            placeholder={
              "https://www.tiktok.com/@account/photo/…\nOne URL per line"
            }
            value={urls}
            onChange={(event) => setUrls(event.target.value)}
          />
        </label>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs font-medium text-app-muted-text">
            The importer downloads the slideshow, reads its visible text, then
            compares it with this automation’s run history.
          </p>
          <Button
            type="button"
            variant="action"
            size="appDefault"
            disabled={working}
            onClick={() => void start()}
          >
            {working ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconSearch className="size-4" />
            )}
            Inspect posts
          </Button>
        </div>
      </section>

      {preview && !preview.posts && !terminalError && (
        <StatusMessage icon={IconLoader2} spin>
          TikTok is downloading the slides. This page will refresh the result
          automatically.
        </StatusMessage>
      )}
      {terminalError && (
        <StatusMessage icon={IconAlertTriangle} tone="error">
          {preview.statusMessage || "TikTok inspection did not complete."}
        </StatusMessage>
      )}

      {preview?.posts && (
        <div className="space-y-4 border-t border-app-panel-border py-6">
          {preview.posts.map((item) => (
            <PostMatchCard
              key={item.post.id}
              item={item}
              value={selections[item.post.id] ?? "recover"}
              onChange={(value) =>
                setSelections((current) => ({
                  ...current,
                  [item.post.id]: value,
                }))
              }
            />
          ))}
          <div className="flex items-end justify-between gap-4 border-t border-app-panel-border pt-5">
            <label className="w-full max-w-sm text-sm font-semibold text-app-text">
              Published through account
              <SelectControl
                className="mt-2 w-full"
                value={selectedIntegrationId}
                disabled={integrationsLoading || integrations.length === 0}
                onChange={(event) => setIntegrationId(event.target.value)}
              >
                {integrations.length === 0 && (
                  <option value="">No connected TikTok account</option>
                )}
                {integrations.map((integration) => (
                  <option
                    key={integration.integration_id}
                    value={integration.integration_id}
                  >
                    {socialAccountShortName(integration)}
                  </option>
                ))}
              </SelectControl>
            </label>
            <Button
              type="button"
              variant="action"
              size="appDefault"
              disabled={
                working || pendingPosts.length === 0 || !selectedIntegrationId
              }
              onClick={() => void linkSelected()}
            >
              {working ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconBrandTiktok className="size-4" />
              )}
              Link {pendingPosts.length || ""} published post
              {pendingPosts.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </SettingsPage>
  )
}

function PostMatchCard({
  item,
  value,
  onChange,
}: {
  item: TikTokPostMatch
  value: string
  onChange: (value: string) => void
}) {
  const photo = item.post.photos[0]?.sourceImageUrl
  return (
    <article className="grid gap-4 rounded-xl border border-app-panel-border bg-app-surface-subtle p-4 sm:grid-cols-[88px_1fr]">
      {photo ? (
        // TikTok's signed CDN URL is short-lived and only used for inspection.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt="First slide from the published TikTok post"
          className="aspect-[9/16] w-[88px] rounded-lg bg-app-panel-border object-cover"
        />
      ) : (
        <div className="aspect-[9/16] w-[88px] rounded-lg bg-app-panel-border" />
      )}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-app-text">
                {item.post.hookText || "Published TikTok slideshow"}
              </span>
              {item.alreadyLinked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <IconCheck className="size-3" /> Linked
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 font-medium text-app-muted-text">
              {item.post.caption}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-app-text-faint">
              {item.post.photoCount} photos · Published{" "}
              {formatDate(item.post.publishedAt)}
            </p>
          </div>
          <a
            href={item.post.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
            aria-label="Open TikTok post"
          >
            <IconExternalLink className="size-4" />
          </a>
        </div>
        {!item.alreadyLinked && (
          <div className="mt-3">
            <label className="text-xs font-bold text-app-text">
              Internal slideshow match
              <SelectControl
                className="mt-1.5 w-full"
                value={value}
                onChange={(event) => onChange(event.target.value)}
              >
                {item.candidates.map((candidate) => (
                  <option
                    key={candidate.runId}
                    value={`run:${candidate.runId}`}
                  >
                    {candidate.title || candidate.hook} ·{" "}
                    {Math.round(candidate.score * 100)}% {candidate.confidence}
                    {candidate.runId === item.recommendedRunId
                      ? " · Recommended"
                      : ""}
                  </option>
                ))}
                <option value="recover">
                  Restore from TikTok images and visible text
                </option>
              </SelectControl>
            </label>
            {value === "recover" && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 font-medium text-amber-800">
                <IconRestore className="mt-0.5 size-3.5 shrink-0" />
                No reliable local result is selected. A historical slideshow and
                disabled hook record will be restored from the published post.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function StatusMessage({
  icon: Icon,
  tone = "neutral",
  spin = false,
  children,
}: {
  icon: typeof IconLoader2
  tone?: "neutral" | "error"
  spin?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-app-panel-border py-6 text-sm font-semibold",
        tone === "error" ? "text-red-700" : "text-app-muted-text"
      )}
    >
      <Icon className={cn("size-5", spin && "animate-spin")} />
      {children}
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
