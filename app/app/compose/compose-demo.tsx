"use client"

import { useMemo, useState } from "react"
import { IconCalendarEvent, IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { PostComposer } from "@/components/realfarm/composer/post-composer"
import type {
  ComposerValue,
  ConnectedComposerAccount,
} from "@/components/realfarm/composer/composer-types"
import { SocialPlatformIcon } from "@/components/realfarm/social-platform"
import { Button } from "@/components/ui/button"
import { composeLimitErrors } from "@/lib/compose-publishing"
import { getApiErrorMessage } from "@/lib/client-api"
import { cn } from "@/lib/utils"

const initialValue: ComposerValue = {
  base: { text: "", media: [] },
  perNetwork: {},
}

type PublishResponse = {
  succeeded?: { network: string }[]
  failed?: { network: string; error?: string }[]
  error?: string
}

export function ComposeDemo({
  accounts,
  onOpenSettings,
}: {
  accounts: ConnectedComposerAccount[]
  onOpenSettings: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(accounts.map((account) => account.integrationId))
  )
  const [scheduledAt, setScheduledAt] = useState("")
  const [publishing, setPublishing] = useState(false)
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedIds.has(account.integrationId)),
    [accounts, selectedIds]
  )
  const limitErrors = composeLimitErrors(value, selectedAccounts)
  const hasContent = selectedAccounts.some((account) => {
    const network = value.perNetwork[account.platformKey]
    const text = network?.useTextOverride ? network.text : value.base.text
    return (
      text.trim().length > 0 ||
      (network?.media.length ?? 0) > 0 ||
      value.base.media.length > 0
    )
  })

  function toggleAccount(integrationId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(integrationId)) next.delete(integrationId)
      else next.add(integrationId)
      return next
    })
  }

  async function publish(mode: "now" | "schedule") {
    if (selectedAccounts.length === 0) {
      toast.error("Choose at least one account")
      return
    }
    if (!hasContent) {
      toast.error("Add text or media before publishing")
      return
    }
    if (limitErrors.length > 0) {
      toast.error(limitErrors[0])
      return
    }
    if (mode === "schedule") {
      const timestamp = Date.parse(scheduledAt)
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        toast.error("Choose a future date and time")
        return
      }
    }

    setPublishing(true)
    const toastId = toast.loading(
      mode === "schedule" ? "Scheduling posts…" : "Publishing posts…"
    )
    try {
      const response = await fetch("/api/compose/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value,
          selectedAccountIds: selectedAccounts.map(
            (account) => account.integrationId
          ),
          mode,
          scheduledAt:
            mode === "schedule"
              ? new Date(scheduledAt).toISOString()
              : undefined,
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | PublishResponse
        | null
      const succeeded = payload?.succeeded ?? []
      const failed = payload?.failed ?? []
      if (!response.ok && succeeded.length === 0 && failed.length === 0) {
        throw new Error(payload?.error || "Publishing failed")
      }
      if (failed.length > 0) {
        const summary = [
          succeeded.length > 0
            ? `${succeeded.map((item) => item.network).join(", ")} succeeded`
            : "",
          `${failed.map((item) => item.network).join(", ")} failed`,
        ]
          .filter(Boolean)
          .join("; ")
        toast.warning(
          summary,
          {
            id: toastId,
            description: failed
              .map((item) => `${item.network}: ${item.error ?? "Unknown error"}`)
              .join(" · "),
          }
        )
      } else {
        toast.success(
          mode === "schedule"
            ? `Scheduled for ${succeeded.map((item) => item.network).join(", ")}`
            : `Published to ${succeeded.map((item) => item.network).join(", ")}`,
          { id: toastId }
        )
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Publishing failed"), {
        id: toastId,
      })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-caption font-semibold tracking-wide text-brand-accent uppercase">
            Compose
          </p>
          <h1 className="mt-1 text-metric font-semibold tracking-tight text-app-text">
            Create a post
          </h1>
          <p className="mt-1 max-w-2xl text-label text-app-muted-text">
            Write once, customize each network, and publish when you are ready.
          </p>
        </div>
        {accounts.length > 0 ? (
          <div aria-label="Connected accounts" className="flex flex-wrap gap-2">
            {accounts.map((account) => {
              const selected = selectedIds.has(account.integrationId)
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "lc-focus-ring flex items-center gap-2 rounded-app-control border px-3 py-2 text-caption font-semibold transition",
                    selected
                      ? "border-brand-accent bg-brand-accent-soft text-brand-accent"
                      : "border-app-panel-border bg-app-surface text-app-muted-text hover:bg-app-control-hover"
                  )}
                  key={account.integrationId}
                  onClick={() => toggleAccount(account.integrationId)}
                  type="button"
                >
                  <SocialPlatformIcon
                    provider={account.platformKey}
                    className="size-4"
                  />
                  <span>{account.accountName}</span>
                  {selected ? <IconCheck className="size-3.5" /> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </header>

      {accounts.length === 0 ? (
        <section className="grid min-h-80 place-items-center rounded-app-panel border border-dashed border-app-panel-border bg-app-surface p-8 text-center shadow-app-card">
          <div>
            <h2 className="text-heading font-semibold text-app-text">
              Connect an account to publish
            </h2>
            <p className="mt-2 max-w-md text-label text-app-muted-text">
              Add a social account in settings, then return here to compose your
              first post.
            </p>
            <Button className="mt-5" onClick={onOpenSettings} variant="action">
              Open account settings
            </Button>
          </div>
        </section>
      ) : (
        <>
          <PostComposer
            accounts={selectedAccounts.length > 0 ? selectedAccounts : accounts}
            onChange={setValue}
            value={value}
          />
          <footer className="sticky bottom-3 z-20 mt-4 flex flex-col gap-3 rounded-app-panel border border-app-panel-border bg-app-surface p-3 shadow-app-card sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-w-0 items-center gap-2 text-label font-semibold text-app-text">
              <IconCalendarEvent className="size-4 shrink-0 text-app-muted-text" />
              <span className="sr-only">Schedule date and time</span>
              <input
                className="lc-focus-ring h-10 min-w-0 rounded-app-control border border-app-panel-border bg-app-surface-subtle px-3 text-label text-app-text"
                min={localDateTimeMinimum()}
                onChange={(event) => setScheduledAt(event.target.value)}
                type="datetime-local"
                value={scheduledAt}
              />
            </label>
            <div className="flex gap-2 sm:justify-end">
              <Button
                disabled={publishing || limitErrors.length > 0}
                onClick={() => void publish("schedule")}
                variant="softControl"
              >
                Schedule
              </Button>
              <Button
                disabled={publishing || limitErrors.length > 0}
                onClick={() => void publish("now")}
                variant="action"
              >
                Post now
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

function localDateTimeMinimum() {
  const date = new Date(Date.now() + 60_000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
