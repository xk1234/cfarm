"use client"

import { useMemo, useState, type ReactNode } from "react"
import { IconExternalLink, IconLink, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  SocialAccountSelectionGrid,
  usePostFastIntegrations,
} from "@/components/realfarm/social-account-selection"
import { socialIntegrationKey } from "@/components/realfarm/social-platform"
import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type {
  PostFastCreatePostType,
  PostFastMedia,
} from "@/lib/postfast-client"
import type { SocialIntegration } from "@/lib/social/provider-contract"

import {
  automationRunSlides,
  slideshowCaption,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

export function SlideshowPublicationActions({
  run,
  onRunChanged,
}: {
  run: AutomationRunApiRecord
  onRunChanged: (run: AutomationRunApiRecord) => void
}) {
  const [modal, setModal] = useState<"post" | "link" | null>(null)
  const [releaseUrl, setReleaseUrl] = useState(
    run.socialStatuses?.find((item) => item.releaseUrl)?.releaseUrl ?? ""
  )

  return (
    <>
      {releaseUrl ? (
        <Button
          variant="softControl"
          size="compact"
          onClick={() =>
            window.open(releaseUrl, "_blank", "noopener,noreferrer")
          }
        >
          <IconExternalLink className="size-4" /> Open live post
        </Button>
      ) : null}
      <Button
        variant="softControl"
        size="compact"
        onClick={() => setModal("link")}
      >
        <IconLink className="size-4" /> Link published post
      </Button>
      <Button variant="action" size="compact" onClick={() => setModal("post")}>
        <IconSend className="size-4" /> Post to social
      </Button>
      {modal ? (
        <SlideshowPublicationModal
          mode={modal}
          run={run}
          onClose={() => setModal(null)}
          onLinked={(url, updated) => {
            setReleaseUrl(url)
            onRunChanged(updated)
          }}
          onRunChanged={onRunChanged}
        />
      ) : null}
    </>
  )
}

function SlideshowPublicationModal({
  mode,
  run,
  onClose,
  onLinked,
  onRunChanged,
}: {
  mode: "post" | "link"
  run: AutomationRunApiRecord
  onClose: () => void
  onLinked: (url: string, run: AutomationRunApiRecord) => void
  onRunChanged: (run: AutomationRunApiRecord) => void
}) {
  const {
    integrations,
    loading,
    error: integrationsError,
  } = usePostFastIntegrations()
  const [selectedKeysState, setSelectedKeys] = useState<string[] | null>(null)
  const selectedKeys =
    selectedKeysState ??
    (mode === "post"
      ? integrations.map(socialIntegrationKey)
      : integrations.slice(0, 1).map(socialIntegrationKey))
  const selectedKeySet = new Set(selectedKeys)
  const [postType, setPostType] = useState<PostFastCreatePostType>("draft")
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDateTime)
  const [publishedAt, setPublishedAt] = useState(
    toDateTimeLocalValue(new Date())
  )
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [completedKeys, setCompletedKeys] = useState<string[]>([])
  const selectedIntegrations = useMemo(
    () =>
      integrations.filter(
        (item) =>
          selectedKeys.includes(socialIntegrationKey(item)) &&
          !completedKeys.includes(socialIntegrationKey(item))
      ),
    [completedKeys, integrations, selectedKeys]
  )

  function toggle(integration: SocialIntegration) {
    const key = socialIntegrationKey(integration)
    if (completedKeys.includes(key)) {
      toast.message(`${integration.name} was already completed in this attempt`)
      return
    }
    setSelectedKeys((currentState) => {
      const current = currentState ?? selectedKeys
      if (mode === "link") return current.includes(key) ? [] : [key]
      return current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    })
  }

  async function submit() {
    if (!run.slideshowId) {
      setError("This output has no slideshow record.")
      return
    }
    if (selectedIntegrations.length === 0) {
      setError("Select at least one social account.")
      return
    }
    if (mode === "link" && !url.trim()) {
      setError("Paste the direct URL for the published post.")
      return
    }
    if (mode === "link" && Number.isNaN(Date.parse(publishedAt))) {
      setError("Select a valid publication date and time.")
      return
    }
    if (
      mode === "post" &&
      postType === "schedule" &&
      Number.isNaN(Date.parse(scheduledAt))
    ) {
      setError("Select a valid schedule date and time.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      if (mode === "link") {
        const integration = selectedIntegrations[0]
        const payload = await createPublicationRecord({
          run,
          integration,
          type: "manual_posted",
          releaseUrl: url,
          date: new Date(publishedAt).toISOString(),
          media: [],
        })
        const releaseUrl = payload.record.releaseUrl || url
        const updated = withPublicationStatus(run, integration, payload.record)
        onLinked(releaseUrl, updated)
        toast.success("Published post linked to this output")
      } else {
        if (postType === "schedule" && !scheduledAt) {
          throw new Error("Select a date and time.")
        }
        const media = await uploadSlideshow(run)
        let updated = run
        const succeeded: SocialIntegration[] = []
        const failed: SocialIntegration[] = []
        for (const integration of selectedIntegrations) {
          try {
            const payload = await createPublicationRecord({
              run,
              integration,
              type: postType,
              date:
                postType === "schedule"
                  ? new Date(scheduledAt).toISOString()
                  : undefined,
              media,
            })
            updated = withPublicationStatus(
              updated,
              integration,
              payload.record
            )
            succeeded.push(integration)
          } catch {
            failed.push(integration)
          }
        }
        if (succeeded.length > 0) {
          onRunChanged(updated)
          setCompletedKeys((current) => [
            ...new Set([...current, ...succeeded.map(socialIntegrationKey)]),
          ])
        }
        if (failed.length > 0) {
          setSelectedKeys(failed.map(socialIntegrationKey))
          const failedNames = failed
            .map((integration) => integration.name)
            .join(", ")
          setError(
            `${succeeded.length} account${succeeded.length === 1 ? "" : "s"} completed. Failed: ${failedNames}. Retry will only submit the failed accounts.`
          )
          return
        }
        toast.success(
          `${postType === "draft" ? "Draft created" : postType === "schedule" ? "Post scheduled" : "Post queued"} for ${selectedIntegrations.length} account${selectedIntegrations.length === 1 ? "" : "s"}`
        )
      }
      onClose()
    } catch (submitError) {
      setError(
        getApiErrorMessage(submitError, "The publication could not be saved.")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppModal className="z-[90] bg-[#24251f]/45" onClose={onClose}>
      <AppModalPanel className="max-w-[760px] overflow-hidden rounded-[10px]">
        <AppModalHeader
          title={
            mode === "post" ? "Post slideshow to social" : "Link published post"
          }
          description={
            mode === "post"
              ? "Upload the slides and create a PostFast draft, scheduled post, or immediate post."
              : "Attach an already-published post so its analytics are attributed to this output."
          }
          onClose={onClose}
        />
        <div className="space-y-5 p-5">
          {error || integrationsError ? (
            <div className="rounded-lg border border-[#f0d8d8] bg-[#fff8f8] px-3 py-2 text-sm font-semibold text-[#a8464f]">
              {error || integrationsError}
            </div>
          ) : null}
          <section>
            <div className="mb-2 flex justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Social account</h3>
                <p className="text-xs text-app-muted-text">
                  {mode === "link"
                    ? "Choose the account that published the post."
                    : "Choose every destination account."}
                </p>
              </div>
              <span className="text-xs font-semibold text-app-muted-text">
                {selectedKeys.length} selected
              </span>
            </div>
            <SocialAccountSelectionGrid
              integrations={integrations}
              selectedKeys={selectedKeySet}
              loading={loading}
              compact
              onToggle={toggle}
            />
          </section>
          {mode === "link" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Published post URL">
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://x.com/account/status/…"
                />
              </Field>
              <Field label="Published at" description={localTimezoneLabel()}>
                <input
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(event) => setPublishedAt(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Action">
                <SelectControl
                  value={postType}
                  onChange={(event) =>
                    setPostType(event.target.value as PostFastCreatePostType)
                  }
                >
                  <option value="draft">Create draft</option>
                  <option value="now">Publish in ~1 min</option>
                  <option value="schedule">Schedule</option>
                </SelectControl>
              </Field>
              {postType === "schedule" ? (
                <Field label="Date and time" description={localTimezoneLabel()}>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          )}
          <Button
            variant="action"
            className="w-full justify-center"
            onClick={() => void submit()}
            disabled={
              submitting || loading || selectedIntegrations.length === 0
            }
          >
            {submitting
              ? "Saving…"
              : mode === "link"
                ? "Link published post"
                : "Continue with PostFast"}
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function Field({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold tracking-[0.08em] text-app-muted-text uppercase">
        {label}
      </span>
      <div className="[&_input]:h-10 [&_input]:w-full [&_input]:rounded-[7px] [&_input]:border [&_input]:border-app-panel-border [&_input]:bg-app-surface [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none">
        {children}
      </div>
      {description ? (
        <span className="mt-1 block text-[11px] font-medium text-app-text-faint">
          {description}
        </span>
      ) : null}
    </label>
  )
}

async function uploadSlideshow(run: AutomationRunApiRecord) {
  const urls = automationRunSlides(run)
    .map((slide) => slide.imageUrl?.trim() || slide.sourceImageUrl?.trim())
    .filter((url): url is string => Boolean(url))
  if (urls.length === 0)
    throw new Error("This slideshow has no rendered images.")
  return Promise.all(
    urls.map(async (url, index) => {
      const payload = await fetchJsonWithTimeout<{ upload?: unknown }>(
        "/api/postfast/upload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          timeoutMs: 60_000,
          toastOnError: false,
        }
      )
      const media = postfastMediaFromUpload(payload.upload)
      if (!media) throw new Error(`PostFast did not accept slide ${index + 1}.`)
      return { ...media, sortOrder: index }
    })
  )
}

async function createPublicationRecord(input: {
  run: AutomationRunApiRecord
  integration: SocialIntegration
  type: PostFastCreatePostType | "manual_posted"
  date?: string
  releaseUrl?: string
  media: PostFastMedia[]
}) {
  return fetchJsonWithTimeout<{ record: PublicationRecord }>(
    "/api/postfast/posts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: input.type,
        date: input.date,
        releaseUrl: input.releaseUrl,
        integrationId: input.integration.integration_id,
        provider: input.integration.provider,
        content:
          [
            slideshowCaption(input.run) || slideshowTitle(input.run),
            input.run.plan?.hashtags,
          ]
            .filter(Boolean)
            .join("\n\n") || "Slideshow",
        media: input.media,
        sourceType: "slideshow",
        sourceId: input.run.slideshowId,
      }),
      timeoutMs: 90_000,
      toastOnError: false,
    }
  )
}

type PublicationRecord = {
  status:
    "draft" | "scheduled" | "published" | "awaiting_manual_post" | "failed"
  scheduledAt?: string
  publishedAt?: string
  releaseUrl?: string
  externalPostId?: string
  error?: string
}

function withPublicationStatus(
  run: AutomationRunApiRecord,
  integration: SocialIntegration,
  record: PublicationRecord
): AutomationRunApiRecord {
  const status = {
    provider: integration.provider,
    integrationId: integration.integration_id,
    name: integration.name,
    profile: integration.profile,
    status: record.status,
    scheduledAt: record.scheduledAt,
    publishedAt: record.publishedAt,
    releaseUrl: record.releaseUrl,
    externalPostId: record.externalPostId,
    error: record.error,
  }
  return {
    ...run,
    socialStatuses: [
      status,
      ...(run.socialStatuses ?? []).filter(
        (item) => item.integrationId !== integration.integration_id
      ),
    ],
    ...(record.publishedAt ? { manuallyPublishedAt: record.publishedAt } : {}),
  }
}

function postfastMediaFromUpload(upload: unknown): PostFastMedia | null {
  if (Array.isArray(upload)) {
    for (const item of upload) {
      const media = postfastMediaFromUpload(item)
      if (media) return media
    }
    return null
  }
  if (!upload || typeof upload !== "object") return null
  const record = upload as Record<string, unknown>
  const key = typeof record.key === "string" ? record.key.trim() : ""
  const type =
    record.type === "IMAGE" || record.type === "VIDEO" ? record.type : undefined
  if (key && type) return { key, type }
  for (const nestedKey of ["upload", "media", "file", "files", "data"]) {
    const media = postfastMediaFromUpload(record[nestedKey])
    if (media) return media
  }
  return null
}

function defaultScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0)
  return toDateTimeLocalValue(date)
}

function toDateTimeLocalValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function localTimezoneLabel() {
  return `Your device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
}
