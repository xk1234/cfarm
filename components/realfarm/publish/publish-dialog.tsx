"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCalendarEvent, IconPlugConnectedX, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  getPublisherStatus,
  listPublisherAccounts,
  publishRender,
  type PublishRenderInput,
  type RenderView,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import type {
  PublisherAccount,
  PublisherStatus,
} from "@/lib/publishing/publisher"
import { cn } from "@/lib/utils"

const TIKTOK_PRIVACY_FALLBACK = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]
const CAPTION_LIMIT = 2200

export type PublishTiming = "now" | "schedule"

export type PublishFormState = {
  accountIds: string[]
  caption: string
  timing: PublishTiming
  /** `datetime-local` value in the viewer's timezone. */
  publishAtLocal: string
  tiktokPrivacy: string
  tiktokAutoMusic: boolean
}

export function tiktokPrivacyOptions(accounts: readonly PublisherAccount[]): string[] {
  for (const account of accounts) {
    const info = account.extra?.creator_info as { privacy_level_options?: unknown } | undefined
    const options = info?.privacy_level_options
    if (Array.isArray(options) && options.every((o) => typeof o === "string") && options.length) {
      return options as string[]
    }
  }
  return TIKTOK_PRIVACY_FALLBACK
}

/** Validates the form and builds the request for `POST /api/publishing/posts`. */
export function buildPublishInput(
  renderId: string,
  form: PublishFormState,
  accounts: readonly PublisherAccount[],
  now: Date = new Date()
): { ok: true; input: PublishRenderInput } | { ok: false; error: string } {
  if (form.accountIds.length === 0) return { ok: false, error: "Choose at least one account." }
  if (form.caption.length > CAPTION_LIMIT) {
    return { ok: false, error: `Captions are limited to ${CAPTION_LIMIT} characters.` }
  }
  let publishAt: string | null = null
  if (form.timing === "schedule") {
    const date = new Date(form.publishAtLocal)
    if (!form.publishAtLocal || Number.isNaN(date.getTime())) {
      return { ok: false, error: "Choose a date and time." }
    }
    if (date.getTime() <= now.getTime() + 60_000) {
      return { ok: false, error: "Choose a time in the future." }
    }
    publishAt = date.toISOString()
  }
  const selected = accounts.filter((account) => form.accountIds.includes(account.id))
  const platformOptions: Record<string, Record<string, unknown>> = {}
  if (selected.some((account) => account.provider === "tiktok")) {
    platformOptions.tiktok = {
      privacy_status: form.tiktokPrivacy,
      auto_add_music: form.tiktokAutoMusic,
    }
  }
  return {
    ok: true,
    input: {
      renderId,
      accountIds: form.accountIds,
      caption: form.caption,
      publishAt,
      platformOptions,
      intentKey: `${renderId}:${[...form.accountIds].sort().join(",")}:${publishAt ?? "now"}`,
    },
  }
}

export function PublishDialog({
  render,
  onClose,
  onOpenSettings,
}: {
  render: Pick<RenderView, "id" | "title" | "slides">
  onClose: () => void
  onOpenSettings?: () => void
}) {
  const status = useQuery({ queryKey: ["publisher-status"], queryFn: getPublisherStatus, retry: false })
  const configured = status.data?.configured === true
  const accounts = useQuery({
    queryKey: ["publisher-accounts"],
    queryFn: listPublisherAccounts,
    enabled: configured,
    retry: false,
  })
  const queryClient = useQueryClient()

  async function submit(input: PublishRenderInput) {
    await publishRender(input)
    await queryClient.invalidateQueries({ queryKey: ["posts"] })
    toast.success(input.publishAt ? "Post scheduled" : "Publishing started")
    onClose()
  }

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="flex max-h-[min(760px,92vh)] w-[min(640px,calc(100vw-24px))] flex-col overflow-hidden p-0">
        <AppModalHeader title="Publish" closeLabel="Close publish dialog" onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <PublishDialogContent
            render={render}
            status={status.isLoading ? null : (status.data ?? null)}
            statusError={status.error instanceof Error ? status.error.message : ""}
            accounts={accounts.data ?? null}
            accountsError={accounts.error instanceof Error ? accounts.error.message : ""}
            onSubmit={submit}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

/** Dialog body without the modal shell (static-renderable for tests). */
export function PublishDialogContent({
  render,
  status,
  statusError = "",
  accounts,
  accountsError = "",
  onSubmit,
  onOpenSettings,
}: {
  render: Pick<RenderView, "id" | "title" | "slides">
  /** null while loading. */
  status: PublisherStatus | null
  statusError?: string
  /** null while loading. */
  accounts: PublisherAccount[] | null
  accountsError?: string
  onSubmit: (input: PublishRenderInput) => Promise<void>
  onOpenSettings?: () => void
}) {
  if (statusError) {
    return <p role="alert" className="text-sm text-app-danger">{statusError}</p>
  }
  if (!status) {
    return <div className="h-32 animate-pulse rounded-xl bg-app-surface-subtle" aria-busy="true" />
  }
  if (!status.configured) {
    return <PublisherNotConnected message={status.message} onOpenSettings={onOpenSettings} />
  }
  if (accountsError) {
    return <p role="alert" className="text-sm text-app-danger">{accountsError}</p>
  }
  if (!accounts) {
    return <div className="h-32 animate-pulse rounded-xl bg-app-surface-subtle" aria-busy="true" />
  }
  return <PublishForm render={render} accounts={accounts} onSubmit={onSubmit} />
}

export function PublisherNotConnected({
  message,
  onOpenSettings,
}: {
  message: string
  onOpenSettings?: () => void
}) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-app-panel-border px-6 py-10 text-center">
      <IconPlugConnectedX className="size-6 text-app-muted-text" />
      <p className="text-base font-semibold text-app-text">{message}</p>
      <p className="max-w-[44ch] text-sm text-app-muted-text">
        Publishing and scheduling need a SocialBu API token on the server. Renders and downloads
        keep working without it.
      </p>
      {onOpenSettings ? (
        <Button type="button" variant="softControl" size="appDefault" onClick={onOpenSettings}>
          Open settings
        </Button>
      ) : null}
    </div>
  )
}

function defaultScheduleLocal(): string {
  const date = new Date(Date.now() + 60 * 60_000)
  date.setMinutes(0, 0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function PublishForm({
  render,
  accounts,
  onSubmit,
}: {
  render: Pick<RenderView, "id" | "title" | "slides">
  accounts: PublisherAccount[]
  onSubmit: (input: PublishRenderInput) => Promise<void>
}) {
  const active = useMemo(() => accounts.filter((account) => account.active), [accounts])
  const privacyOptions = useMemo(() => tiktokPrivacyOptions(active), [active])
  const [form, setForm] = useState<PublishFormState>(() => ({
    accountIds: [],
    caption: "",
    timing: "now",
    publishAtLocal: defaultScheduleLocal(),
    tiktokPrivacy: privacyOptions[0] ?? "PUBLIC_TO_EVERYONE",
    tiktokAutoMusic: true,
  }))
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const hasTikTok = active.some(
    (account) => account.provider === "tiktok" && form.accountIds.includes(account.id)
  )

  function patch(next: Partial<PublishFormState>) {
    setForm((current) => ({ ...current, ...next }))
    setError("")
  }

  async function submit() {
    const built = buildPublishInput(render.id, form, active)
    if (!built.ok) {
      setError(built.error)
      return
    }
    setPending(true)
    try {
      await onSubmit(built.input)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Publishing failed.")
    } finally {
      setPending(false)
    }
  }

  const label = form.timing === "schedule" ? "Schedule" : "Publish"

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p className="text-sm text-app-muted-text">
        {render.title || "Untitled render"} · {render.slides.length} slide
        {render.slides.length === 1 ? "" : "s"}
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-app-text">Accounts</legend>
        {active.length === 0 ? (
          <p className="text-sm text-app-muted-text">No connected accounts in SocialBu.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {active.map((account) => {
              const checked = form.accountIds.includes(account.id)
              return (
                <li key={account.id}>
                  <label
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
                      checked ? "border-app-action bg-app-action/5" : "border-app-panel-border"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        patch({
                          accountIds: event.target.checked
                            ? [...form.accountIds, account.id]
                            : form.accountIds.filter((id) => id !== account.id),
                        })
                      }
                      className="size-4 accent-[var(--app-action)]"
                    />
                    {account.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- provider avatar
                      <img src={account.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-app-text">{account.name}</span>
                      <span className="block text-xs capitalize text-app-muted-text">{account.provider}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </fieldset>

      <label className="block space-y-1.5">
        <span className="flex items-baseline justify-between text-sm font-semibold text-app-text">
          Caption
          <span className="text-[11px] font-normal tabular-nums text-app-muted-text">
            {form.caption.length}/{CAPTION_LIMIT}
          </span>
        </span>
        <textarea
          value={form.caption}
          rows={4}
          onChange={(event) => patch({ caption: event.target.value })}
          className="w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 py-2 text-sm outline-none focus:border-app-action"
        />
      </label>

      {hasTikTok ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-app-text">TikTok privacy</span>
            <select
              value={form.tiktokPrivacy}
              onChange={(event) => patch({ tiktokPrivacy: event.target.value })}
              className="h-9 w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm"
            >
              {privacyOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-app-text">
            <input
              type="checkbox"
              checked={form.tiktokAutoMusic}
              onChange={(event) => patch({ tiktokAutoMusic: event.target.checked })}
              className="size-4 accent-[var(--app-action)]"
            />
            Add recommended music
          </label>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-app-text">When</legend>
        <div className="flex flex-wrap gap-4">
          {(["now", "schedule"] as const).map((timing) => (
            <label key={timing} className="flex items-center gap-2 text-sm font-medium text-app-text">
              <input
                type="radio"
                name="timing"
                checked={form.timing === timing}
                onChange={() => patch({ timing })}
                className="size-4 accent-[var(--app-action)]"
              />
              {timing === "now" ? "Publish now" : "Schedule"}
            </label>
          ))}
        </div>
        {form.timing === "schedule" ? (
          <input
            type="datetime-local"
            aria-label="Publish at"
            value={form.publishAtLocal}
            onChange={(event) => patch({ publishAtLocal: event.target.value })}
            className="h-9 rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm"
          />
        ) : null}
      </fieldset>

      {error ? <p role="alert" className="text-sm font-medium text-app-danger">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" variant="action" size="appDefault" className="min-w-[132px]" disabled={pending || active.length === 0}>
          {form.timing === "schedule" ? <IconCalendarEvent /> : <IconSend />}
          {pending ? (form.timing === "schedule" ? "Scheduling…" : "Publishing…") : label}
        </Button>
      </div>
    </form>
  )
}
