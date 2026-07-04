"use client"

import { useEffect, useRef, useState } from "react"
import { IconCalendar, IconDownload, IconPlayerPlay, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { generatedVideoTypeConfig, type GeneratedVideoExport } from "@/lib/generated-video-types"

type PostizIntegration = {
  id: string
  name?: string
  identifier?: string
  provider?: string
  providerIdentifier?: string
  profile?: string
  picture?: string
}

type PostizMedia = {
  id: string
  path: string
}

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
        {title} <span className="text-[#a9a8a1]">({exports.length})</span>
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
        <div className="grid min-h-32 place-items-center rounded-[8px] border border-dashed border-[#d6d5ce] bg-[#f8f8f4] px-6 text-center text-[14px] font-semibold text-[#77766f]">
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
      <article className="overflow-hidden rounded-[7px] border border-[#deddd5] bg-white shadow-sm">
        <div className="relative flex aspect-[9/16] flex-col items-center justify-center gap-4 bg-white p-6 text-center">
          <div className="text-[13px] font-semibold text-[#667085]">{generatedVideoTypeConfig[item.type].pendingLabel}</div>
          <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-[#ecebe4]">
            <div className="h-full w-2/5 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-[#242421]" />
          </div>
        </div>
      </article>
    )
  }

  if (isFailed) {
    return (
      <article className="overflow-hidden rounded-[7px] border border-[#f1c7c7] bg-white shadow-sm">
        <div className="relative flex aspect-[9/16] flex-col items-center justify-center gap-3 bg-[#fff7f7] p-6 text-center">
          <div className="text-[13px] font-bold text-[#ad3434]">Generation failed</div>
          <div className="line-clamp-4 text-[12px] font-semibold leading-5 text-[#8d5c5c]">
            {item.error || "This video could not be rendered."}
          </div>
          <Button
            type="button"
            variant="iconControl"
            size="icon-control-sm"
            className="absolute right-2 top-2 bg-white/90 text-[#ad3434] shadow-sm hover:bg-white"
            onClick={deleteOutput}
            disabled={deleting}
            aria-label="Delete output"
            title="Delete output"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </article>
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
    <article className="overflow-hidden rounded-[7px] border border-[#deddd5] bg-white shadow-sm">
      <div className="relative aspect-[9/16] bg-[#d8d6ce]">
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
          <div className="absolute inset-0 bg-gradient-to-br from-[#dfd2c4] via-[#a37b68] to-[#3c3532]" />
        )}
        <div className="absolute right-2 top-2 z-20 flex gap-1">
          <Button
            type="button"
            variant="iconControl"
            size="icon-control-sm"
            className="bg-white/90 text-[#333] shadow-sm hover:bg-white"
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
            className="bg-white/90 text-[#333] shadow-sm hover:bg-white"
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
            className="bg-white/90 text-[#ad3434] shadow-sm hover:bg-white"
            onClick={deleteOutput}
            disabled={deleting}
            aria-label="Delete output"
            title="Delete output"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </div>
    </article>
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
  const [integrations, setIntegrations] = useState<PostizIntegration[]>([])
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("")
  const [caption, setCaption] = useState(() => item.caption || item.title)
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDateTime)
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    void fetchJsonWithTimeout<{ integrations?: PostizIntegration[] }>("/api/postiz/integrations", {
      toastOnError: false,
    })
      .then((payload) => {
        if (!active) {
          return
        }
        const allIntegrations = payload.integrations ?? []
        const tikTokIntegrations = allIntegrations.filter(isTikTokIntegration)
        const nextIntegrations = tikTokIntegrations.length > 0 ? tikTokIntegrations : allIntegrations
        setIntegrations(nextIntegrations)
        setSelectedIntegrationId(nextIntegrations[0]?.id ?? "")
      })
      .catch((integrationsError) => {
        if (active) {
          setError(getApiErrorMessage(integrationsError, "Failed to load TikTok accounts"))
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

  async function schedulePost() {
    const selectedIntegration = integrations.find((integration) => integration.id === selectedIntegrationId)
    const cleanCaption = caption.trim()

    if (!item.videoUrl) {
      setError("This output does not have a rendered video yet.")
      return
    }
    if (!selectedIntegration) {
      setError("Select a TikTok account.")
      return
    }
    if (!cleanCaption) {
      setError("Write a caption.")
      return
    }
    if (!scheduledAt) {
      setError("Select a date and time.")
      return
    }
    if (Number.isNaN(new Date(scheduledAt).getTime())) {
      setError("Select a valid date and time.")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      await toast.promise(createScheduledPost(item, selectedIntegration, cleanCaption, scheduledAt), {
        loading: "Adding post to schedule...",
        success: "Post added to schedule",
        error: (submitError) => getApiErrorMessage(submitError, "Failed to schedule post"),
      })
      onClose()
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Failed to schedule post"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppModal className="z-[80] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[520px]">
        <AppModalHeader
          title="Schedule post"
          description="Send this output to a TikTok account through Postiz."
          closeLabel="Close schedule modal"
          onClose={onClose}
        />
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#77766f]">TikTok account</span>
            <SelectControl
              className="h-10 w-full rounded-[7px] bg-white px-3 text-[14px] font-semibold text-[#333] focus:border-[#9f9e96]"
              value={selectedIntegrationId}
              onChange={(event) => setSelectedIntegrationId(event.target.value)}
              disabled={loadingIntegrations || integrations.length === 0}
            >
              {loadingIntegrations ? (
                <option>Loading accounts...</option>
              ) : integrations.length > 0 ? (
                integrations.map((integration) => (
                  <option key={integration.id} value={integration.id}>
                    {integrationLabel(integration)}
                  </option>
                ))
              ) : (
                <option>No TikTok accounts found</option>
              )}
            </SelectControl>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#77766f]">Caption</span>
            <textarea
              className="min-h-28 w-full resize-y rounded-[7px] border border-[#d6d5ce] bg-white px-3 py-2 text-[14px] font-semibold text-[#333] outline-none focus:border-[#9f9e96]"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Write a TikTok caption"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#77766f]">Date and time</span>
            <input
              className="h-10 w-full rounded-[7px] border border-[#d6d5ce] bg-white px-3 text-[14px] font-semibold text-[#333] outline-none focus:border-[#9f9e96]"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          {error && <p className="text-[12px] font-semibold text-[#d94444]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="softControl" size="appDefault" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="action"
              size="appDefault"
              onClick={schedulePost}
              disabled={submitting || loadingIntegrations || integrations.length === 0}
            >
              {submitting ? "Scheduling..." : "Add to schedule"}
            </Button>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

async function createScheduledPost(
  item: GeneratedVideoExport,
  integration: PostizIntegration,
  caption: string,
  scheduledAt: string,
) {
  const uploadPayload = await fetchJsonWithTimeout<{ upload?: unknown }>("/api/postiz/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: item.videoUrl }),
    timeoutMs: 60_000,
    toastOnError: false,
  })
  const media = postizMediaFromUpload(uploadPayload.upload)

  if (!media) {
    throw new Error("Postiz did not return uploaded video media.")
  }

  await fetchJsonWithTimeout("/api/postiz/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "schedule",
      date: new Date(scheduledAt).toISOString(),
      integrationId: integration.id,
      provider: providerForIntegration(integration),
      content: caption,
      media: [media],
      sourceType: item.type,
      sourceId: item.id,
    }),
    timeoutMs: 60_000,
    toastOnError: false,
  })
}

function postizMediaFromUpload(upload: unknown): PostizMedia | null {
  if (Array.isArray(upload)) {
    for (const item of upload) {
      const media = postizMediaFromUpload(item)
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
  const id = stringValue(record.id)
  const mediaPath = stringValue(record.path)

  if (id && mediaPath) {
    return { id, path: mediaPath }
  }

  for (const key of ["upload", "media", "file", "files", "data"]) {
    const media = postizMediaFromUpload(record[key])
    if (media) {
      return media
    }
  }

  return null
}

function integrationLabel(integration: PostizIntegration) {
  return integration.name || integration.profile || integration.identifier || integration.id
}

function isTikTokIntegration(integration: PostizIntegration) {
  return integrationSearchText(integration).includes("tiktok")
}

function providerForIntegration(integration: PostizIntegration) {
  const provider = integration.providerIdentifier || integration.provider || integration.identifier
  return provider?.toLowerCase().includes("tiktok") ? provider : "tiktok"
}

function integrationSearchText(integration: PostizIntegration) {
  return [
    integration.name,
    integration.identifier,
    integration.provider,
    integration.providerIdentifier,
    integration.profile,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
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
