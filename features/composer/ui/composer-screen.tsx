"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconCalendarEvent,
  IconCheck,
  IconFileText,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { composerValueFromSources } from "@/features/composer/domain/sources"
import { PostComposer } from "@/features/composer/ui/post-composer"
import type {
  ComposerSourceOutput,
  ComposerValue,
  ConnectedComposerAccount,
} from "@/features/composer/domain/composer"
import { SocialPlatformIcon } from "@/components/realfarm/social-platform"
import { Button } from "@/components/ui/button"
import { composeLimitErrors } from "@/lib/compose-validation"
import { getApiErrorMessage } from "@/lib/client-api"
import { cn } from "@/lib/utils"
import { useWorkspaceShell } from "@/features/workspace/ui/workspace-shell"

const initialValue = composerValueFromSources([])

type PublishResponse = {
  succeeded?: { network: string }[]
  failed?: { network: string; error?: string }[]
  error?: string
}

type RepurposeResponse = {
  variants?: Record<string, { text?: string; title?: string }>
  error?: string
}

export function ComposerScreen({
  accounts,
  sourceOutputs,
}: {
  accounts: ConnectedComposerAccount[]
  sourceOutputs: ComposerSourceOutput[]
}) {
  const router = useRouter()
  const { openSettings } = useWorkspaceShell()
  const [value, setValue] = useState<ComposerValue>(initialValue)
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(accounts.map((account) => account.integrationId))
  )
  const [scheduledAt, setScheduledAt] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [repurposing, setRepurposing] = useState(false)
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedIds.has(account.integrationId)),
    [accounts, selectedIds]
  )
  const selectedSources = useMemo(
    () =>
      value.sourceOutputIds.flatMap((id) => {
        const source = sourceOutputs.find((item) => item.id === id)
        return source ? [source] : []
      }),
    [sourceOutputs, value.sourceOutputIds]
  )
  const limitErrors = composeLimitErrors(value, selectedAccounts)
  const hasContent = selectedAccounts.some((account) => {
    const network = value.perNetwork[account.platformKey]
    const text = network?.useTextOverride ? network.text : value.base.text
    return text.trim().length > 0 || value.base.media.length > 0
  })
  const canPublish =
    value.sourceOutputIds.length > 0 &&
    selectedAccounts.length > 0 &&
    hasContent &&
    limitErrors.length === 0 &&
    !publishing

  function toggleAccount(integrationId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(integrationId)) next.delete(integrationId)
      else next.add(integrationId)
      return next
    })
  }

  function toggleSource(source: ComposerSourceOutput) {
    const selected = selectedSources.some((item) => item.id === source.id)
    const next = selected
      ? selectedSources.filter((item) => item.id !== source.id)
      : [...selectedSources, source]
    setValue(composerValueFromSources(next))
  }

  async function repurpose() {
    if (selectedSources.length === 0) {
      toast.error("Choose at least one template output")
      return
    }
    if (selectedAccounts.length === 0) {
      toast.error("Choose at least one account")
      return
    }
    setRepurposing(true)
    const toastId = toast.loading("Creating platform versions…")
    try {
      const response = await fetch("/api/compose/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceOutputIds: value.sourceOutputIds,
          platforms: [
            ...new Set(selectedAccounts.map((account) => account.platformKey)),
          ],
        }),
      })
      const payload = (await response
        .json()
        .catch(() => null)) as RepurposeResponse | null
      if (!response.ok) {
        throw new Error(payload?.error || "Content repurposing failed")
      }
      const variants = payload?.variants ?? {}
      setValue((current) => ({
        ...current,
        perNetwork: Object.fromEntries(
          Object.entries(variants).map(([platform, variant]) => [
            platform,
            {
              useTextOverride: true,
              text: variant.text ?? current.base.text,
              media: [],
              fields: variant.title ? { title: variant.title } : {},
            },
          ])
        ),
      }))
      toast.success("Platform versions are ready", { id: toastId })
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Content repurposing failed"), {
        id: toastId,
      })
    } finally {
      setRepurposing(false)
    }
  }

  async function publish(mode: "now" | "schedule") {
    if (value.sourceOutputIds.length === 0) {
      toast.error("Choose at least one template output")
      return
    }
    if (selectedAccounts.length === 0) {
      toast.error("Choose at least one account")
      return
    }
    if (!hasContent) {
      toast.error("The selected output has no publishable content")
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
      const payload = (await response
        .json()
        .catch(() => null)) as PublishResponse | null
      const succeeded = payload?.succeeded ?? []
      const failed = payload?.failed ?? []
      if (!response.ok && succeeded.length === 0 && failed.length === 0) {
        throw new Error(payload?.error || "Publishing failed")
      }
      if (failed.length > 0) {
        toast.warning(
          `${succeeded.length} succeeded; ${failed.length} failed`,
          {
            id: toastId,
            description: failed
              .map(
                (item) => `${item.network}: ${item.error ?? "Unknown error"}`
              )
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
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-5 flex min-h-11 items-center">
        <h1 className="text-metric font-semibold tracking-tight text-app-text">
          Compose
        </h1>
      </header>

      {accounts.length === 0 ? (
        <section className="grid min-h-80 place-items-center rounded-app-panel border border-dashed border-app-panel-border bg-app-surface p-8 text-center shadow-app-card">
          <div>
            <h2 className="text-heading font-semibold text-app-text">
              Connect an account to publish
            </h2>
            <Button className="mt-5" onClick={openSettings} variant="action">
              Open account settings
            </Button>
          </div>
        </section>
      ) : (
        <PostComposer
          accounts={selectedAccounts.length > 0 ? selectedAccounts : accounts}
          editorFooter={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-w-0 items-center gap-2">
                <IconCalendarEvent className="size-4 shrink-0 text-app-muted-text" />
                <span className="sr-only">Schedule date and time</span>
                <input
                  className="lc-focus-ring h-10 min-w-0 flex-1 rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text sm:w-auto sm:flex-none"
                  min={localDateTimeMinimum()}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  type="datetime-local"
                  value={scheduledAt}
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <Button
                  disabled={!canPublish}
                  onClick={() => void publish("schedule")}
                  variant="softControl"
                >
                  Schedule
                </Button>
                <Button
                  disabled={!canPublish}
                  onClick={() => void publish("now")}
                  variant="action"
                >
                  Post now
                </Button>
              </div>
            </div>
          }
          editorHeader={
            <div className="space-y-4">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-heading font-semibold text-app-text">
                    Template outputs
                  </h2>
                  <Button
                    onClick={() => router.push("/app/templates")}
                    size="appDefault"
                    variant="ghost"
                  >
                    Open templates
                  </Button>
                </div>
                {sourceOutputs.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {sourceOutputs.map((source) => (
                      <SourceOutputCard
                        key={source.id}
                        onClick={() => toggleSource(source)}
                        selected={value.sourceOutputIds.includes(source.id)}
                        source={source}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-24 place-items-center bg-app-surface-subtle p-4 text-center">
                    <div>
                      <p className="text-label font-semibold text-app-text">
                        No generated outputs yet
                      </p>
                      <Button
                        className="mt-3"
                        onClick={() => router.push("/app/templates")}
                        variant="action"
                      >
                        Generate from a template
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div
                aria-label="Publish accounts"
                className="flex items-center gap-2 overflow-x-auto border-t border-app-panel-border pt-4"
              >
                {accounts.map((account) => {
                  const selected = selectedIds.has(account.integrationId)
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "lc-focus-ring flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-caption font-semibold transition",
                        selected
                          ? "border-brand-accent bg-brand-accent-soft text-brand-accent"
                          : "border-app-panel-border bg-app-surface text-app-muted-text"
                      )}
                      key={account.integrationId}
                      onClick={() => toggleAccount(account.integrationId)}
                      type="button"
                    >
                      <SocialPlatformIcon
                        className="size-4"
                        provider={account.platformKey}
                      />
                      {account.accountName}
                      {selected ? <IconCheck className="size-3.5" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          }
          onChange={setValue}
          onRepurpose={() => void repurpose()}
          repurposing={repurposing}
          sources={selectedSources}
          value={value}
        />
      )}
    </div>
  )
}

function SourceOutputCard({
  onClick,
  selected,
  source,
}: {
  onClick: () => void
  selected: boolean
  source: ComposerSourceOutput
}) {
  const isVisual = source.kind !== "text"
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "lc-focus-ring group relative shrink-0 overflow-hidden rounded-app-control border text-left transition",
        isVisual ? "w-20" : "w-44",
        selected
          ? "border-brand-accent ring-2 ring-brand-accent/20"
          : "border-app-panel-border hover:border-app-text-faint"
      )}
      onClick={onClick}
      type="button"
    >
      <div
        className={cn(
          "relative grid place-items-center overflow-hidden bg-app-surface-subtle",
          isVisual ? "aspect-[9/16]" : "h-24"
        )}
      >
        {source.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-full object-cover"
            src={source.thumbnailUrl}
          />
        ) : (
          <IconFileText className="size-6 text-app-muted-text" />
        )}
        {source.kind === "video" ? (
          <span className="absolute inset-0 grid place-items-center bg-black/10 text-white">
            <IconPlayerPlayFilled className="size-6" />
          </span>
        ) : null}
        {selected ? (
          <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-brand-accent text-white shadow-sm">
            <IconCheck className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="p-2.5">
        <p className="truncate text-caption font-semibold text-app-text">
          {source.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-app-muted-text">
          {source.templateName}
        </p>
      </div>
    </button>
  )
}

function localDateTimeMinimum() {
  const date = new Date(Date.now() + 60_000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
