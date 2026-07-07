"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconBrandBluesky,
  IconBrandFacebookFilled,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
  IconCalendar,
  IconCheck,
  IconDownload,
  IconPlus,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import {
  MediaCardShell,
  MediaErrorState,
  MediaFrame,
  MediaPendingState,
} from "@/components/realfarm/shared-media"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { generatedVideoTypeConfig, type GeneratedVideoExport } from "@/lib/generated-video-types"
import {
  normalizePostFastIntegration,
  type PostFastCreatePostType,
  type PostFastMedia,
  type PostFastSocialIntegration,
  type PostFastSocialProvider,
} from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

export function GeneratedVideoExports({
  title,
  exports,
  emptyMessage,
  onDeleted,
}: {
  title: string
  exports: GeneratedVideoExport[]
  emptyMessage: string
  onDeleted?: (id: string) => void
}) {
  const [scheduleItem, setScheduleItem] = useState<GeneratedVideoExport | null>(null)

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-[22px] font-semibold">
        {title} <span className="text-app-text-faint">({exports.length})</span>
      </h2>
      {exports.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {exports.map((item) => (
            <GeneratedVideoCard
              key={item.id}
              item={item}
              onSchedule={() => setScheduleItem(item)}
              onDeleted={() => onDeleted?.(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="app-empty-state grid min-h-32 place-items-center px-6 text-center text-[14px] font-semibold">
          {emptyMessage}
        </div>
      )}
      {scheduleItem && (
        <ScheduleGeneratedVideoModal
          item={scheduleItem}
          onClose={() => setScheduleItem(null)}
        />
      )}
    </section>
  )
}

function GeneratedVideoCard({
  item,
  onSchedule,
  onDeleted,
}: {
  item: GeneratedVideoExport
  onSchedule: () => void
  onDeleted: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isPending = !item.videoUrl && (item.status === "queued" || item.status === "processing")
  const isFailed = !item.videoUrl && item.status === "failed"

  useEffect(() => {
    if (!item.videoUrl || item.previewUrl) {
      return
    }

    const video = videoRef.current
    if (!video) {
      return
    }

    let stopped = false
    const prime = () => {
      if (!stopped) {
        primeVideoThumbnail(video, false)
      }
    }
    const timeouts = [0, 250, 1000, 2500].map((delay) => window.setTimeout(prime, delay))

    video.addEventListener("loadedmetadata", prime)
    video.addEventListener("loadeddata", prime)
    video.load()

    return () => {
      stopped = true
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
      video.removeEventListener("loadedmetadata", prime)
      video.removeEventListener("loadeddata", prime)
    }
  }, [item.videoUrl, item.previewUrl])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

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
      <MediaCardShell>
        <MediaPendingState label={generatedVideoTypeConfig[item.type].pendingLabel} />
      </MediaCardShell>
    )
  }

  if (isFailed) {
    return (
      <MediaCardShell danger>
        <MediaErrorState
          title="Generation failed"
          message={item.error || "This video could not be rendered."}
          action={
            <Button
              type="button"
              variant="iconControl"
              size="icon-control-sm"
              className="absolute right-2 top-2 bg-white/90 text-app-danger-muted shadow-sm hover:bg-white"
              onClick={deleteOutput}
              disabled={deleting}
              aria-label="Delete output"
              title="Delete output"
            >
              <IconTrash className="size-4" />
            </Button>
          }
        />
      </MediaCardShell>
    )
  }

  async function deleteOutput() {
    if (deleting) {
      return
    }

    setDeleting(true)
    try {
      await toast.promise(
        fetchJsonWithTimeout<{ export?: GeneratedVideoExport }>(`/api/generated-videos?id=${encodeURIComponent(item.id)}`, {
          method: "DELETE",
          timeoutMs: 15_000,
          toastOnError: false,
        }),
        {
          loading: "Deleting output...",
          success: "Output deleted",
          error: (error) => getApiErrorMessage(error, "Failed to delete output"),
        },
      )
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <MediaCardShell>
      <MediaFrame>
        {item.videoUrl ? (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src={item.videoUrl}
              poster={item.previewUrl}
              muted
              playsInline
              preload={item.previewUrl ? "metadata" : "auto"}
              onLoadedMetadata={(event) => primeVideoThumbnail(event.currentTarget, Boolean(item.previewUrl))}
              onLoadedData={(event) => primeVideoThumbnail(event.currentTarget, Boolean(item.previewUrl))}
              onEnded={() => setPlaying(false)}
            />
            <button
              className="absolute inset-0 z-10 flex items-center justify-center"
              onClick={togglePlay}
              aria-label={playing ? "Pause video" : "Play video"}
            >
              {!playing && (
                <div className="grid size-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/60">
                  <IconPlayerPlay className="size-7 text-white" fill="white" />
                </div>
              )}
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
        <div className="absolute right-2 top-2 z-20 flex gap-1">
          <Button
            type="button"
            variant="iconControl"
            size="icon-control-sm"
            className="bg-white/90 text-app-text shadow-sm hover:bg-white"
            onClick={saveVideo}
            disabled={!item.videoUrl}
            aria-label="Save video"
            title="Save video"
          >
            <IconDownload className="size-4" />
          </Button>
          <Button
            type="button"
            variant="iconControl"
            size="icon-control-sm"
            className="bg-white/90 text-app-text shadow-sm hover:bg-white"
            onClick={onSchedule}
            disabled={!item.videoUrl}
            aria-label="Schedule post"
            title="Schedule post"
          >
            <IconCalendar className="size-4" />
          </Button>
          <Button
            type="button"
            variant="iconControl"
            size="icon-control-sm"
            className="bg-white/90 text-app-danger-muted shadow-sm hover:bg-white"
            onClick={deleteOutput}
            disabled={deleting}
            aria-label="Delete output"
            title="Delete output"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </MediaFrame>
    </MediaCardShell>
  )
}

function primeVideoThumbnail(video: HTMLVideoElement, hasPoster: boolean) {
  if (hasPoster || !video.paused || video.currentTime > 0.05) {
    return
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 0
  if (duration <= 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return
  }

  const targetTime = Math.min(0.35, duration / 2)

  try {
    video.currentTime = targetTime
    video.dataset.thumbnailPrimed = "true"
  } catch {
    // Some browsers reject seeks before enough data is loaded; the poster path covers new renders.
  }
}

function ScheduleGeneratedVideoModal({
  item,
  onClose,
}: {
  item: GeneratedVideoExport
  onClose: () => void
}) {
  const [integrations, setIntegrations] = useState<PostFastSocialIntegration[]>([])
  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>([])
  const [postType, setPostType] = useState<PostFastCreatePostType>("draft")
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDateTime)
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    void fetchJsonWithTimeout<{ integrations?: unknown[] }>("/api/postfast/integrations", {
      toastOnError: false,
    })
      .then((payload) => {
        if (!active) {
          return
        }
        const nextIntegrations = (payload.integrations ?? []).flatMap((integration) => {
          const normalized = normalizePostFastIntegration(integration)
          return normalized && !normalized.disabled ? [normalized] : []
        })
        setIntegrations(nextIntegrations)
        setSelectedIntegrationIds(nextIntegrations.map(integrationKey))
      })
      .catch((integrationsError) => {
        if (active) {
          setError(getApiErrorMessage(integrationsError, "Failed to load social accounts"))
        }
      })
      .finally(() => {
        if (active) {
          setLoadingIntegrations(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  function toggleIntegration(integration: PostFastSocialIntegration) {
    const key = integrationKey(integration)
    setSelectedIntegrationIds((current) =>
      current.includes(key)
        ? current.filter((id) => id !== key)
        : [...current, key]
    )
  }

  async function submitPost() {
    const selectedIntegrations = integrations.filter((integration) =>
      selectedIntegrationIds.includes(integrationKey(integration))
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
    if (postType === "schedule" && Number.isNaN(new Date(scheduledAt).getTime())) {
      setError("Select a valid date and time.")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      await toast.promise(createPostsForIntegrations({
        item,
        integrations: selectedIntegrations,
        type: postType,
        scheduledAt: postType === "schedule" ? scheduledAt : undefined,
      }), {
        loading: postSubmitLoadingLabel(postType, selectedIntegrations.length),
        success: postSubmitSuccessLabel(postType, selectedIntegrations.length),
        error: (submitError) => getApiErrorMessage(submitError, postSubmitErrorLabel(postType)),
      })
      onClose()
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
          {error && (
            <div className="rounded-lg border border-[#f0d8d8] bg-[#fff8f8] px-3 py-2 text-sm font-semibold text-[#a8464f]">
              {error}
            </div>
          )}
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[#242421]">
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
            {loadingIntegrations ? (
              <div className="grid min-h-[172px] place-items-center rounded-[8px] border border-app-panel-border bg-white text-sm font-semibold text-app-muted-text">
                Loading accounts...
              </div>
            ) : integrations.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {integrations.map((integration) => (
                  <GeneratedVideoAccountTile
                    key={integrationKey(integration)}
                    integration={integration}
                    selected={selectedIntegrationIds.includes(integrationKey(integration))}
                    onClick={() => toggleIntegration(integration)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-[172px] place-items-center rounded-[8px] border border-dashed border-app-panel-border bg-white px-6 text-center text-sm font-semibold text-app-muted-text">
                No connected social accounts found.
              </div>
            )}
          </section>
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#77766f]">Action</span>
            <SelectControl
              className="h-10 w-full rounded-[7px] bg-white px-3 text-[14px] font-semibold text-[#333] focus:border-[#9f9e96]"
              value={postType}
              onChange={(event) => setPostType(postTypeValue(event.target.value))}
            >
              <option value="draft">Draft</option>
              <option value="now">Publish now</option>
              <option value="schedule">Schedule</option>
            </SelectControl>
          </label>
          {postType === "schedule" && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#77766f]">Date and time</span>
              <input
                className="h-10 w-full rounded-[7px] border border-[#d6d5ce] bg-white px-3 text-[14px] font-semibold text-[#333] outline-none focus:border-[#9f9e96]"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          )}
          <Button
            type="button"
            variant="action"
            size="appDefault"
            className="w-full justify-center"
            onClick={submitPost}
            disabled={submitting || loadingIntegrations || integrations.length === 0 || selectedIntegrationIds.length === 0}
          >
            {submitting ? postSubmittingLabel(postType) : postCtaLabel(postType, selectedIntegrationIds.length)}
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
  item: GeneratedVideoExport,
  integrations: PostFastSocialIntegration[],
  type: PostFastCreatePostType,
  scheduledAt?: string,
}) {
  const media = await uploadGeneratedVideoToPostFast(item)
  for (const integration of integrations) {
    await createPostFastPost({
      item,
      integration,
      media,
      type,
      scheduledAt,
    })
  }
}

async function uploadGeneratedVideoToPostFast(item: GeneratedVideoExport) {
  const uploadPayload = await fetchJsonWithTimeout<{ upload?: unknown }>("/api/postfast/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: item.videoUrl }),
    timeoutMs: 60_000,
    toastOnError: false,
  })
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
  integration: PostFastSocialIntegration
  media: PostFastMedia
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
      media: [media],
      sourceType: item.type,
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
  const sortOrder = typeof record.sortOrder === "number" ? record.sortOrder : undefined

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

function GeneratedVideoAccountTile({
  integration,
  selected,
  onClick,
}: {
  integration: PostFastSocialIntegration
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex min-w-0 flex-col items-center rounded-[8px] border bg-white px-2 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#242421] hover:shadow-md",
        selected
          ? "border-[#242421] ring-2 ring-app-action/25"
          : "border-app-panel-border"
      )}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="relative grid size-14 place-items-center rounded-full bg-[#111] text-white shadow-sm">
        <PlatformIcon provider={integration.provider} className="size-8" />
        <span
          className={cn(
            "absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border border-white text-white shadow-sm",
            selected ? "bg-app-action" : "bg-[#8d8c85]"
          )}
        >
          {selected ? (
            <IconCheck className="size-3.5" />
          ) : (
            <IconPlus className="size-3.5" />
          )}
        </span>
      </span>
      <span className="mt-2 w-full truncate text-[12px] leading-4 font-semibold text-[#242421]">
        {accountShortName(integration)}
      </span>
      <span className="mt-0.5 w-full truncate text-[11px] leading-4 font-medium text-app-muted-text">
        {providerLabel(integration.provider)}
      </span>
    </button>
  )
}

function PlatformIcon({
  provider,
  className,
}: {
  provider: PostFastSocialProvider
  className?: string
}) {
  switch (provider) {
    case "instagram":
      return <IconBrandInstagram className={className} stroke={2.4} />
    case "youtube":
      return <IconBrandYoutubeFilled className={className} stroke={2.4} />
    case "tiktok":
    case "tiktok-creative":
    case "tiktok-seller":
      return <IconBrandTiktok className={className} stroke={2.4} />
    case "facebook":
      return <IconBrandFacebookFilled className={className} stroke={2.4} />
    case "x":
    case "twitter":
      return <IconBrandX className={className} stroke={2.4} />
    case "linkedin":
      return <IconBrandLinkedin className={className} stroke={2.4} />
    case "threads":
      return <IconBrandThreads className={className} stroke={2.4} />
    case "pinterest":
      return <IconBrandPinterest className={className} stroke={2.4} />
    case "bluesky":
      return <IconBrandBluesky className={className} stroke={2.4} />
    case "telegram":
      return <IconBrandTelegram className={className} stroke={2.4} />
    default:
      return <IconBrandTiktok className={className} stroke={2.4} />
  }
}

function integrationKey(integration: PostFastSocialIntegration) {
  return `${integration.provider}:${integration.integration_id}`
}

function accountShortName(integration: PostFastSocialIntegration) {
  return (
    integration.profile?.replace(/^@/, "") ||
    integration.name ||
    providerLabel(integration.provider)
  )
}

function providerLabel(provider: PostFastSocialProvider) {
  switch (provider) {
    case "youtube":
      return "YouTube"
    case "instagram":
      return "Instagram"
    case "tiktok":
      return "TikTok"
    case "tiktok-creative":
      return "TikTok Creative"
    case "tiktok-seller":
      return "TikTok Seller"
    case "facebook":
      return "Facebook"
    case "x":
      return "X"
    case "twitter":
      return "Twitter"
    case "linkedin":
      return "LinkedIn"
    case "threads":
      return "Threads"
    case "pinterest":
      return "Pinterest"
    case "bluesky":
      return "Bluesky"
    case "telegram":
      return "Telegram"
    case "google":
      return "Google"
    case "google-business-profile":
      return "Google Business Profile"
    default:
      return provider
  }
}

function postTypeValue(value: string): PostFastCreatePostType {
  return value === "draft" || value === "now" || value === "schedule" ? value : "draft"
}

function postContent(item: GeneratedVideoExport) {
  return item.caption || item.title || generatedVideoTypeConfig[item.type].title
}

function postCtaLabel(type: PostFastCreatePostType, count: number) {
  const suffix = count > 0 ? ` (${count})` : ""
  switch (type) {
    case "now":
      return `Publish now${suffix}`
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
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 16)
}

function downloadFileName(item: GeneratedVideoExport) {
  const pathname = item.videoUrl ? new URL(item.videoUrl, window.location.href).pathname : ""
  const extension = pathname.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4"
  return `${slugify(item.title || item.type)}${extension}`
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "generated-video"
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function mediaTypeValue(value: unknown) {
  return value === "IMAGE" || value === "VIDEO" ? value : undefined
}
