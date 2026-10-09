"use client"

import { useMemo, useState, type ReactNode } from "react"
import { IconExternalLink, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  SocialAccountSelectionGrid,
  usePublishingIntegrations,
} from "@/components/realfarm/social-account-selection"
import { socialIntegrationKey } from "@/components/realfarm/social-platform"
import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import type { SlideshowViewerAction } from "@/components/realfarm/slideshow-viewer-modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { SlideshowRecord } from "@/lib/slideshows"
import type { SocialIntegration } from "@/lib/social/provider-contract"

/**
 * The render fields the publish dialog reads. `id` is the render id sent to
 * `POST /api/publishing/posts`.
 */
export type PublishableSlideshow = Pick<
  SlideshowRecord,
  "id" | "title" | "caption" | "hashtags" | "output_images"
> & {
  images?: Array<{ image_url?: string }>
}

type PublishMode = "now" | "schedule"

type PublishedPost = {
  id: string
  accountId: string
  status: string
  permalink: string | null
  error: string | null
}

export function SlideshowPublishActions({
  slideshow,
  initialReleaseUrl = "",
  children,
}: {
  slideshow: PublishableSlideshow
  initialReleaseUrl?: string
  children: (actions: SlideshowViewerAction[]) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const actions: SlideshowViewerAction[] = [
    ...(initialReleaseUrl
      ? [
          {
            label: "Open live post",
            icon: <IconExternalLink className="size-4" />,
            onSelect: () =>
              window.open(initialReleaseUrl, "_blank", "noopener,noreferrer"),
          },
        ]
      : []),
    {
      label: "Post to social",
      icon: <IconSend className="size-4" />,
      onSelect: () => setOpen(true),
    },
  ]

  return (
    <>
      {children(actions)}
      {open ? (
        <SlideshowPublishModal
          slideshow={slideshow}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function SlideshowPublishModal({
  slideshow,
  onClose,
}: {
  slideshow: PublishableSlideshow
  onClose: () => void
}) {
  const {
    integrations,
    loading,
    error: integrationsError,
  } = usePublishingIntegrations()
  const [selectedKeysState, setSelectedKeys] = useState<string[] | null>(null)
  const selectedKeys =
    selectedKeysState ?? integrations.map(socialIntegrationKey)
  const selectedKeySet = new Set(selectedKeys)
  const [mode, setMode] = useState<PublishMode>("now")
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDateTime)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  // One key per dialog: a double submit cannot create duplicate posts.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const selectedIntegrations = useMemo(
    () =>
      integrations.filter((item) =>
        selectedKeys.includes(socialIntegrationKey(item))
      ),
    [integrations, selectedKeys]
  )

  function toggle(integration: SocialIntegration) {
    const key = socialIntegrationKey(integration)
    setSelectedKeys((currentState) => {
      const current = currentState ?? selectedKeys
      return current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    })
  }

  async function submit() {
    if (!slideshow.id) {
      setError("This output has no render id.")
      return
    }
    if (selectedIntegrations.length === 0) {
      setError("Select at least one social account.")
      return
    }
    if (mode === "schedule" && Number.isNaN(Date.parse(scheduledAt))) {
      setError("Select a valid schedule date and time.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const payload = await fetchJsonWithTimeout<{ posts: PublishedPost[] }>(
        "/api/publishing/posts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            renderId: slideshow.id,
            accountIds: selectedIntegrations.map(
              (integration) => integration.integration_id
            ),
            caption: [slideshow.caption?.trim(), slideshow.hashtags?.trim()]
              .filter(Boolean)
              .join("\n\n"),
            publishAt:
              mode === "schedule"
                ? new Date(scheduledAt).toISOString()
                : null,
            idempotencyKey,
          }),
          timeoutMs: 180_000,
          toastOnError: false,
        }
      )
      const failed = payload.posts.filter((post) => post.status === "failed")
      if (failed.length > 0) {
        setError(
          failed.map((post) => post.error || "Publishing failed.").join(" ")
        )
        return
      }
      toast.success(
        `${mode === "schedule" ? "Scheduled" : "Publishing"} to ${payload.posts.length} account${payload.posts.length === 1 ? "" : "s"}`
      )
      onClose()
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "The post could not be sent."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppModal className="z-[90] bg-[#24251f]/45" onClose={onClose}>
      <AppModalPanel className="max-w-[760px] overflow-hidden rounded-[10px]">
        <AppModalHeader title="Post slideshow to social" onClose={onClose} />
        <div className="space-y-5 p-5">
          {error || integrationsError ? (
            <div className="rounded-lg border border-[#f0d8d8] bg-[#fff8f8] px-3 py-2 text-sm font-semibold text-[#a8464f]">
              {error || integrationsError}
            </div>
          ) : null}
          <section>
            <div className="mb-2 flex justify-between gap-3">
              <h3 className="text-sm font-semibold">Social account</h3>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Action">
              <SelectControl
                value={mode}
                onChange={(event) => setMode(event.target.value as PublishMode)}
              >
                <option value="now">Publish now</option>
                <option value="schedule">Schedule</option>
              </SelectControl>
            </Field>
            {mode === "schedule" ? (
              <Field label="Date and time" description={localTimezoneLabel()}>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </Field>
            ) : null}
          </div>
          <Button
            variant="action"
            className="w-full justify-center"
            onClick={() => void submit()}
            disabled={
              submitting || loading || selectedIntegrations.length === 0
            }
          >
            {submitting
              ? "Sending…"
              : mode === "schedule"
                ? "Schedule with SocialBu"
                : "Publish with SocialBu"}
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
