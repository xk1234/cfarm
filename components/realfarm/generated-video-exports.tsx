"use client"

import { useState } from "react"
import {
  IconCalendar,
  IconDownload,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  AutomationGenerationEmptyState,
  AutomationGenerationGrid,
} from "@/components/realfarm/automation-settings/automation-generation-grid"
import { GeneratedVideoExportViewer } from "@/components/realfarm/automation-settings/generated-video-export-viewer"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import {
  MediaCard,
  MediaCardAction,
  MediaCardActions,
  MediaCardFallback,
  MediaCardPreview,
} from "@/components/ui/media-card"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  generatedVideoTypeConfig,
  type GeneratedVideoExport,
} from "@/lib/generated-video-types"
import {
  type PostFastCreatePostType,
  type PostFastMedia,
} from "@/lib/postfast-client"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import { cn } from "@/lib/utils"

import { useVideoThumbnailFrame } from "./use-video-thumbnail-frame"
import { PublicationStatusControl } from "./publication-status-control"
import {
  SocialAccountSelectionGrid,
  usePostFastIntegrations,
} from "./social-account-selection"
import { socialIntegrationKey } from "./social-platform"

export function GeneratedVideoExports({
  title,
  exports,
  emptyMessage,
  onDeleted,
  variant = "gallery",
}: {
  title: string
  exports: GeneratedVideoExport[]
  emptyMessage: string
  onDeleted?: (id: string) => void
  variant?: "gallery" | "automation"
}) {
  const [scheduleItem, setScheduleItem] = useState<GeneratedVideoExport | null>(
    null
  )
  const [viewerItem, setViewerItem] = useState<GeneratedVideoExport | null>(
    null
  )
  const [locallyScheduledIds, setLocallyScheduledIds] = useState<string[]>([])

  const visibleExports =
    variant === "automation" ? exports.slice(0, 3) : exports
  const cards = visibleExports.map((item) => (
    <GeneratedVideoCard
      key={item.id}
      item={
        locallyScheduledIds.includes(item.id)
          ? { ...item, deletionBlockedBy: "scheduled" }
          : item
      }
      onOpen={() => setViewerItem(item)}
      onSchedule={() => setScheduleItem(item)}
      onDeleted={() => onDeleted?.(item.id)}
    />
  ))

  return (
    <section className={cn(variant === "gallery" && "mt-6")}>
      <h2
        className={cn(
          variant === "gallery" ? "mb-3 text-[22px] font-semibold" : "sr-only"
        )}
      >
        {title} <span className="text-app-text-faint">({exports.length})</span>
      </h2>
      {exports.length > 0 ? (
        variant === "automation" ? (
          <AutomationGenerationGrid>{cards}</AutomationGenerationGrid>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {cards}
          </div>
        )
      ) : variant === "automation" ? (
        <AutomationGenerationEmptyState>
          {emptyMessage}
        </AutomationGenerationEmptyState>
      ) : (
        <div className="app-empty-state grid min-h-32 place-items-center px-6 text-center text-[14px] font-semibold">
          {emptyMessage}
        </div>
      )}
      {scheduleItem && (
        <ScheduleGeneratedVideoModal
          item={scheduleItem}
          onClose={() => setScheduleItem(null)}
          onCompleted={(type) => {
            if (type === "schedule") {
              setLocallyScheduledIds((current) => [
                ...new Set([...current, scheduleItem.id]),
              ])
            }
            setScheduleItem(null)
          }}
        />
      )}
      {viewerItem ? (
        <GeneratedVideoExportViewer
          item={viewerItem}
          onClose={() => setViewerItem(null)}
        />
      ) : null}
    </section>
  )
}

function GeneratedVideoCard({
  item,
  onOpen,
  onSchedule,
  onDeleted,
}: {
  item: GeneratedVideoExport
  onOpen: () => void
  onSchedule: () => void
  onDeleted: () => void
}) {
  const { videoRef, thumbnailReady } = useVideoThumbnailFrame(
    item.previewUrl ? undefined : item.videoUrl
  )
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isPending =
    !item.videoUrl && (item.status === "queued" || item.status === "processing")
  const isFailed = !item.videoUrl && item.status === "failed"

  function saveVideo() {
    if (!item.videoUrl) {
      toast.error("This output does not have a rendered video yet.")
      return
    }

    const link = document.createElement("a")
    link.href = item.videoUrl
    link.download = downloadFileName(item)
    document.body.append(link)
    link.click()
    link.remove()
  }

  if (isPending) {
    return (
      <MediaCard>
        <MediaCardPreview
          state="loading"
          fallback={
            <MediaCardFallback
              label={generatedVideoTypeConfig[item.type].pendingLabel}
              loading
            />
          }
        />
      </MediaCard>
    )
  }

  if (isFailed) {
    return (
      <>
        <MediaCard tone="danger">
          <MediaCardPreview
            state="error"
            fallback={
              <>
                <MediaCardFallback label="Generation failed" />
                <p className="absolute inset-x-6 bottom-6 z-30 line-clamp-4 text-center text-caption font-semibold text-brand-danger">
                  {item.error || "This video could not be rendered."}
                </p>
              </>
            }
          >
            <MediaCardActions>
              <MediaCardAction
                className="text-brand-danger"
                onClick={() => setDeleteOpen(true)}
                disabled={deleting}
                aria-label="Delete output"
                title="Delete output"
              >
                <IconTrash className="size-4" />
              </MediaCardAction>
            </MediaCardActions>
          </MediaCardPreview>
        </MediaCard>
        {deleteOpen ? (
          <ConfirmDialog
            title="Delete this video output?"
            description="This permanently removes the generated video and cannot be undone."
            confirmLabel="Delete output"
            pendingLabel="Deleting…"
            onCancel={() => setDeleteOpen(false)}
            onConfirm={deleteOutput}
          />
        ) : null}
      </>
    )
  }

  async function deleteOutput() {
    if (deleting) {
      return
    }

    setDeleting(true)
    try {
      await toast.promise(
        fetchJsonWithTimeout<{ export?: GeneratedVideoExport }>(
          `/api/generated-videos/${encodeURIComponent(item.id)}`,
          {
            method: "DELETE",
            timeoutMs: 15_000,
            toastOnError: false,
          }
        ),
        {
          loading: "Deleting output...",
          success: "Output deleted",
          error: (error) =>
            getApiErrorMessage(error, "Failed to delete output"),
        }
      )
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <MediaCard>
        <MediaCardPreview state="ready">
          {item.videoUrl ? (
            <>
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                src={item.videoUrl}
                poster={item.previewUrl}
                muted
                playsInline
                preload={item.previewUrl ? "none" : "metadata"}
              />
              {!item.previewUrl && !thumbnailReady ? (
                <div className="app-media-poster-fallback pointer-events-none absolute inset-0" />
              ) : null}
              <button
                className="absolute inset-0 z-10 flex items-center justify-center"
                onClick={onOpen}
                aria-label="Open video viewer"
              >
                <div className="grid size-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/60">
                  <IconPlayerPlay className="size-7 text-white" fill="white" />
                </div>
              </button>
            </>
          ) : item.previewUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${item.previewUrl})` }}
            />
          ) : (
            <div className="app-media-poster-fallback absolute inset-0" />
          )}
          <MediaCardActions>
            <MediaCardAction
              onClick={saveVideo}
              disabled={!item.videoUrl}
              aria-label="Save video"
              title="Save video"
            >
              <IconDownload className="size-4" />
            </MediaCardAction>
            <MediaCardAction
              onClick={onSchedule}
              disabled={!item.videoUrl}
              aria-label="Schedule post"
              title="Schedule post"
            >
              <IconCalendar className="size-4" />
            </MediaCardAction>
            <MediaCardAction
              className="text-brand-danger"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
              aria-label="Delete output"
              title="Delete output"
            >
              <IconTrash className="size-4" />
            </MediaCardAction>
          </MediaCardActions>
          <GeneratedVideoPublicationStatusSelect item={item} />
        </MediaCardPreview>
      </MediaCard>
      {deleteOpen ? (
        <ConfirmDialog
          title="Delete this video output?"
          description="This permanently removes the generated video and cannot be undone."
          confirmLabel="Delete output"
          pendingLabel="Deleting…"
          onCancel={() => setDeleteOpen(false)}
          onConfirm={deleteOutput}
        />
      ) : null}
    </>
  )
}

function GeneratedVideoPublicationStatusSelect({
  item,
}: {
  item: GeneratedVideoExport
}) {
  const [publishedAt, setPublishedAt] = useState(item.manuallyPublishedAt)
  const [marking, setMarking] = useState(false)
  const published =
    Boolean(publishedAt) || item.deletionBlockedBy === "published"
  const scheduled = !published && item.deletionBlockedBy === "scheduled"

  async function markPublished() {
    if (marking) return
    setMarking(true)
    try {
      const payload = await fetchJsonWithTimeout<{
        export?: GeneratedVideoExport
      }>(`/api/generated-videos/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markPublished" }),
        toastOnError: false,
      })
      if (!payload.export?.manuallyPublishedAt) {
        throw new Error("The generated post was not updated.")
      }
      setPublishedAt(payload.export.manuallyPublishedAt)
      toast.success("Marked as published")
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "The post could not be marked as published.")
      )
    } finally {
      setMarking(false)
    }
  }

  return (
    <PublicationStatusControl
      status={
        published ? "published" : scheduled ? "scheduled" : "not_published"
      }
      marking={marking}
      className="absolute top-2 left-2 z-20"
      onMarkPublished={markPublished}
    />
  )
}

function ScheduleGeneratedVideoModal({
  item,
  onClose,
  onCompleted,
}: {
  item: GeneratedVideoExport
  onClose: () => void
  onCompleted: (type: PostFastCreatePostType) => void
}) {
  const {
    integrations,
    error: integrationsError,
    loading: loadingIntegrations,
  } = usePostFastIntegrations()
  const [selectedIntegrationIdsState, setSelectedIntegrationIds] = useState<
    string[] | null
  >(null)
  const selectedIntegrationIds =
    selectedIntegrationIdsState ?? integrations.map(socialIntegrationKey)
  const selectedIntegrationKeys = new Set(selectedIntegrationIds)
  const [postType, setPostType] = useState<PostFastCreatePostType>("draft")
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDateTime)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [completedIntegrationKeys, setCompletedIntegrationKeys] = useState<
    string[]
  >([])

  function toggleIntegration(integration: SocialIntegration) {
    const key = socialIntegrationKey(integration)
    if (completedIntegrationKeys.includes(key)) {
      toast.message(`${integration.name} was already completed in this attempt`)
      return
    }
    setSelectedIntegrationIds((currentState) => {
      const current = currentState ?? integrations.map(socialIntegrationKey)
      return current.includes(key)
        ? current.filter((id) => id !== key)
        : [...current, key]
    })
  }

  async function submitPost() {
    const selectedIntegrations = integrations.filter(
      (integration) =>
        selectedIntegrationIds.includes(socialIntegrationKey(integration)) &&
        !completedIntegrationKeys.includes(socialIntegrationKey(integration))
    )
    if (!item.videoUrl) {
      setError("This output does not have a rendered video yet.")
      return
    }
    if (selectedIntegrations.length === 0) {
      setError("Select at least one social account.")
      return
    }
    if (postType === "schedule" && !scheduledAt) {
      setError("Select a date and time.")
      return
    }
    if (
      postType === "schedule" &&
      Number.isNaN(new Date(scheduledAt).getTime())
    ) {
      setError("Select a valid date and time.")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const result = await toast
        .promise(
          createPostsForIntegrations({
            item,
            integrations: selectedIntegrations,
            type: postType,
            scheduledAt: postType === "schedule" ? scheduledAt : undefined,
          }),
          {
            loading: postSubmitLoadingLabel(
              postType,
              selectedIntegrations.length
            ),
            success: (result) =>
              result.failed.length > 0
                ? `${result.succeeded.length} of ${selectedIntegrations.length} accounts completed`
                : postSubmitSuccessLabel(postType, selectedIntegrations.length),
            error: (submitError) =>
              getApiErrorMessage(submitError, postSubmitErrorLabel(postType)),
          }
        )
        .unwrap()
      if (result.succeeded.length > 0) {
        setCompletedIntegrationKeys((current) => [
          ...new Set([
            ...current,
            ...result.succeeded.map(socialIntegrationKey),
          ]),
        ])
      }
      if (result.failed.length > 0) {
        setSelectedIntegrationIds(result.failed.map(socialIntegrationKey))
        setError(
          `${result.succeeded.length} account${result.succeeded.length === 1 ? "" : "s"} completed. Failed: ${result.failed.map((integration) => integration.name).join(", ")}. Retry will only submit the failed accounts.`
        )
        return
      }
      onCompleted(postType)
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, postSubmitErrorLabel(postType)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppModal className="z-[80] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[760px]">
        <AppModalHeader
          title="Post to social"
          description="Choose connected accounts and send this output through PostFast."
          closeLabel="Close post modal"
          onClose={onClose}
        />
        <div className="space-y-5 p-5">
          {(error || integrationsError) && (
            <div className="rounded-lg border border-[#f0d8d8] bg-[#fff8f8] px-3 py-2 text-sm font-semibold text-[#a8464f]">
              {error || integrationsError}
            </div>
          )}
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-app-text">
                  Social accounts
                </h3>
                <p className="text-[12px] font-medium text-app-muted-text">
                  Click accounts to select where this video will be sent.
                </p>
              </div>
              <span className="text-[12px] font-semibold text-app-muted-text">
                {selectedIntegrationIds.length} selected
              </span>
            </div>
            <SocialAccountSelectionGrid
              integrations={integrations}
              selectedKeys={selectedIntegrationKeys}
              loading={loadingIntegrations}
              onToggle={toggleIntegration}
            />
          </section>
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
              Action
            </span>
            <SelectControl
              className="h-10 w-full rounded-[7px] bg-app-surface px-3 text-[14px] font-semibold text-app-text focus:border-[#9f9e96]"
              value={postType}
              onChange={(event) =>
                setPostType(postTypeValue(event.target.value))
              }
            >
              <option value="draft">Draft</option>
              <option value="now">Publish in ~1 min</option>
              <option value="schedule">Schedule</option>
            </SelectControl>
          </label>
          {postType === "schedule" && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
                Date and time
              </span>
              <input
                className="h-10 w-full rounded-[7px] border border-[#d6d5ce] bg-app-surface px-3 text-[14px] font-semibold text-app-text outline-none focus:border-[#9f9e96]"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
              <span className="mt-1 block text-[11px] font-medium text-app-text-faint normal-case">
                Your device timezone: {localTimezoneLabel()}
              </span>
            </label>
          )}
          <Button
            type="button"
            variant="action"
            size="appDefault"
            className="w-full justify-center"
            onClick={submitPost}
            disabled={
              submitting ||
              loadingIntegrations ||
              integrations.length === 0 ||
              selectedIntegrationIds.length === 0
            }
          >
            {submitting
              ? postSubmittingLabel(postType)
              : postCtaLabel(postType, selectedIntegrationIds.length)}
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

async function createPostsForIntegrations({
  item,
  integrations,
  type,
  scheduledAt,
}: {
  item: GeneratedVideoExport
  integrations: SocialIntegration[]
  type: PostFastCreatePostType
  scheduledAt?: string
}) {
  const media = await uploadGeneratedVideoToPostFast(item)
  const succeeded: SocialIntegration[] = []
  const failed: SocialIntegration[] = []
  for (const integration of integrations) {
    try {
      await createPostFastPost({
        item,
        integration,
        media,
        type,
        scheduledAt,
      })
      succeeded.push(integration)
    } catch {
      failed.push(integration)
    }
  }
  return { succeeded, failed }
}

async function uploadGeneratedVideoToPostFast(item: GeneratedVideoExport) {
  const uploadPayload = await fetchJsonWithTimeout<{ upload?: unknown }>(
    "/api/postfast/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: item.videoUrl }),
      timeoutMs: 60_000,
      toastOnError: false,
    }
  )
  const media = postfastMediaFromUpload(uploadPayload.upload)

  if (!media) {
    throw new Error("PostFast did not return uploaded video media.")
  }

  return media
}

async function createPostFastPost({
  item,
  integration,
  media,
  type,
  scheduledAt,
}: {
  item: GeneratedVideoExport
  integration: SocialIntegration
  media?: PostFastMedia
  type: PostFastCreatePostType
  scheduledAt?: string
}) {
  await fetchJsonWithTimeout("/api/postfast/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      date: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      integrationId: integration.integration_id,
      provider: integration.provider,
      content: postContent(item),
      media: media ? [media] : [],
      sourceType:
        item.type === "template_video" ? "generated_video" : item.type,
      sourceId: item.id,
    }),
    timeoutMs: 60_000,
    toastOnError: false,
  })
}

function postfastMediaFromUpload(upload: unknown): PostFastMedia | null {
  if (Array.isArray(upload)) {
    for (const item of upload) {
      const media = postfastMediaFromUpload(item)
      if (media) {
        return media
      }
    }
    return null
  }

  if (!upload || typeof upload !== "object") {
    return null
  }

  const record = upload as Record<string, unknown>
  const key = stringValue(record.key)
  const type = mediaTypeValue(record.type)
  const sortOrder =
    typeof record.sortOrder === "number" ? record.sortOrder : undefined

  if (key && type) {
    return { key, type, sortOrder }
  }

  for (const key of ["upload", "media", "file", "files", "data"]) {
    const media = postfastMediaFromUpload(record[key])
    if (media) {
      return media
    }
  }

  return null
}

function postTypeValue(value: string): PostFastCreatePostType {
  return value === "draft" || value === "now" || value === "schedule"
    ? value
    : "draft"
}

function postContent(item: GeneratedVideoExport) {
  const description =
    item.description || item.title || generatedVideoTypeConfig[item.type].title
  return [description, item.hashtags.join(" ")].filter(Boolean).join("\n\n")
}

function postCtaLabel(type: PostFastCreatePostType, count: number) {
  const suffix = count > 0 ? ` (${count})` : ""
  switch (type) {
    case "now":
      return `Publish in ~1 min${suffix}`
    case "schedule":
      return `Schedule${suffix}`
    case "draft":
    default:
      return `Create draft${suffix}`
  }
}

function postSubmittingLabel(type: PostFastCreatePostType) {
  switch (type) {
    case "now":
      return "Publishing..."
    case "schedule":
      return "Scheduling..."
    case "draft":
    default:
      return "Creating draft..."
  }
}

function postSubmitLoadingLabel(type: PostFastCreatePostType, count: number) {
  switch (type) {
    case "now":
      return `Publishing to ${count} account${count === 1 ? "" : "s"}...`
    case "schedule":
      return `Scheduling ${count} post${count === 1 ? "" : "s"}...`
    case "draft":
    default:
      return `Creating ${count} draft${count === 1 ? "" : "s"}...`
  }
}

function postSubmitSuccessLabel(type: PostFastCreatePostType, count: number) {
  switch (type) {
    case "now":
      return `Published to ${count} account${count === 1 ? "" : "s"}`
    case "schedule":
      return `Scheduled ${count} post${count === 1 ? "" : "s"}`
    case "draft":
    default:
      return `Created ${count} draft${count === 1 ? "" : "s"}`
  }
}

function postSubmitErrorLabel(type: PostFastCreatePostType) {
  switch (type) {
    case "now":
      return "Failed to publish post"
    case "schedule":
      return "Failed to schedule post"
    case "draft":
    default:
      return "Failed to create draft"
  }
}

function defaultScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0)
  return toDateTimeLocalValue(date)
}

function toDateTimeLocalValue(date: Date) {
  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  )
  return offsetDate.toISOString().slice(0, 16)
}

function localTimezoneLabel() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function downloadFileName(item: GeneratedVideoExport) {
  const pathname = item.videoUrl
    ? new URL(item.videoUrl, window.location.href).pathname
    : ""
  const extension = pathname.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4"
  return `${slugify(item.title || item.type)}${extension}`
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generated-video"
  )
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function mediaTypeValue(value: unknown) {
  return value === "IMAGE" || value === "VIDEO" ? value : undefined
}
