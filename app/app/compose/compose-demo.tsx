"use client"

import { useEffect, useMemo, useState } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconFileText,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconSend,
  IconVideo,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import type { ConnectedComposerAccount } from "@/components/realfarm/composer/composer-types"
import { SocialPlatformIcon } from "@/components/realfarm/social-platform"
import { Button } from "@/components/ui/button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { ContentOutput } from "@/lib/content-outputs"
import type { ContentTemplate } from "@/lib/content-templates"
import { cn } from "@/lib/utils"

type PublishMode = "draft" | "now" | "schedule"

export function ComposeDemo({
  accounts,
  accountsStatus,
  onOpenSettings,
}: {
  accounts: ConnectedComposerAccount[]
  accountsStatus: "ready" | "empty" | "error"
  onOpenSettings: () => void
}) {
  const [outputs, setOutputs] = useState<ContentOutput[]>([])
  const [templates, setTemplates] = useState<ContentTemplate[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [processorTemplateId, setProcessorTemplateId] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [loadRevision, setLoadRevision] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const selectedOutputs = useMemo(
    () =>
      selectedIds.flatMap((id) => outputs.find((item) => item.id === id) ?? []),
    [outputs, selectedIds]
  )
  const processorTemplates = templates.filter(
    (template) => template.kind !== "video"
  )

  useEffect(() => {
    const controller = new AbortController()
    const requestedOutput = new URLSearchParams(window.location.search).get(
      "output"
    )
    Promise.all([
      fetchJsonWithTimeout<{ outputs?: ContentOutput[] }>("/api/outputs", {
        toastOnError: false,
        signal: controller.signal,
      }),
      fetchJsonWithTimeout<{ templates?: ContentTemplate[] }>(
        "/api/templates",
        { toastOnError: false, signal: controller.signal }
      ),
    ])
      .then(([outputPayload, templatePayload]) => {
        if (controller.signal.aborted) return
        const nextOutputs = (outputPayload.outputs ?? []) as ContentOutput[]
        setOutputs(nextOutputs)
        setTemplates((templatePayload.templates ?? []) as ContentTemplate[])
        if (
          requestedOutput &&
          nextOutputs.some((item) => item.id === requestedOutput)
        ) {
          setSelectedIds([requestedOutput])
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoadError(
          getApiErrorMessage(
            error,
            "Composition workspace could not be loaded"
          )
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [loadRevision])

  function toggleOutput(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function moveOutput(id: string, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current
      }
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  async function processOutputs() {
    if (!processorTemplateId || selectedIds.length === 0) return
    setProcessing(true)
    const toastId = toast.loading("Generating from selected outputs…")
    try {
      const payload = await fetchJsonWithTimeout<{
        output?: { id?: string }
        generation?: { outputIds?: string[] }
      }>(
        `/api/templates/${encodeURIComponent(processorTemplateId)}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputOutputIds: selectedIds }),
          toastOnError: false,
        }
      )
      const outputId =
        payload?.output?.id ?? payload?.generation?.outputIds?.[0]
      if (outputId) {
        const refreshed = await fetchJsonWithTimeout<{ outputs?: ContentOutput[] }>(
          "/api/outputs",
          { toastOnError: false }
        )
        setOutputs(refreshed.outputs ?? [])
        setSelectedIds([outputId])
      }
      toast.success("New output created", { id: toastId })
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Generation failed"), {
        id: toastId,
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-metric font-semibold tracking-tight text-app-text">
          Compose
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-app-panel border border-app-panel-border bg-app-surface shadow-app-card">
          <div className="flex items-center justify-between border-b border-app-panel-border px-4 py-3">
            <h2 className="text-label font-bold text-app-text">Outputs</h2>
            <span className="text-caption font-semibold text-app-muted-text">
              {selectedIds.length} selected
            </span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-label text-app-muted-text">
              Loading…
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="grid min-h-56 place-items-center p-8 text-center"
            >
              <div className="max-w-sm">
                <h2 className="text-heading font-semibold text-app-text">
                  Outputs could not be loaded
                </h2>
                <p className="mt-2 text-label text-app-muted-text">
                  {loadError}
                </p>
                <Button
                  className="mt-4"
                  variant="softControl"
                  onClick={() => {
                    setLoading(true)
                    setLoadError("")
                    setLoadRevision((value) => value + 1)
                  }}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : outputs.length === 0 ? (
            <div className="p-8 text-center text-label text-app-muted-text">
              Generate a template to create your first output.
            </div>
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {outputs.map((output) => (
                <OutputCard
                  key={output.id}
                  output={output}
                  selected={selectedIds.includes(output.id)}
                  onToggle={() => toggleOutput(output.id)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="h-fit rounded-app-panel border border-app-panel-border bg-app-surface p-4 shadow-app-card lg:sticky lg:top-4">
          <h2 className="text-label font-bold text-app-text">
            Process with a template
          </h2>
          <div className="mt-3 space-y-3">
            <select
              aria-label="Processor template"
              className="lc-focus-ring h-10 w-full rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text"
              value={processorTemplateId}
              onChange={(event) => setProcessorTemplateId(event.target.value)}
            >
              <option value="">Choose template</option>
              {processorTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.kind}
                </option>
              ))}
            </select>
            <Button
              className="w-full"
              variant="softControl"
              disabled={
                selectedIds.length === 0 || !processorTemplateId || processing
              }
              onClick={() => void processOutputs()}
            >
              <IconPlayerPlay className="size-4" />
              Generate next output
            </Button>
          </div>

          <div className="my-4 h-px bg-app-panel-border" />

          <h2 className="text-label font-bold text-app-text">Composition</h2>
          <div className="mt-3 space-y-2">
            {selectedOutputs.length === 0 ? (
              <div className="rounded-app-control border border-dashed border-app-panel-border p-4 text-center text-caption font-semibold text-app-muted-text">
                Select outputs in the library.
              </div>
            ) : (
              selectedOutputs.map((output, index) => (
                <div
                  key={output.id}
                  className="flex items-center gap-2 rounded-app-control border border-app-panel-border p-2"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-app-surface-subtle text-caption font-bold text-app-muted-text">
                    {index + 1}
                  </span>
                  <OutputKindIcon kind={output.kind} />
                  <span className="min-w-0 flex-1 truncate text-caption font-semibold text-app-text">
                    {output.title}
                  </span>
                  <Button
                    type="button"
                    variant="iconControl"
                    size="icon-control-sm"
                    className="size-8"
                    disabled={index === 0}
                    onClick={() => moveOutput(output.id, -1)}
                    aria-label={`Move ${output.title} earlier`}
                    title="Move earlier"
                  >
                    <IconArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="iconControl"
                    size="icon-control-sm"
                    className="size-8"
                    disabled={index === selectedOutputs.length - 1}
                    onClick={() => moveOutput(output.id, 1)}
                    aria-label={`Move ${output.title} later`}
                    title="Move later"
                  >
                    <IconArrowDown className="size-4" />
                  </Button>
                  <button
                    type="button"
                    aria-label={`Remove ${output.title}`}
                    className="lc-focus-ring rounded-app-control p-1 text-app-muted-text hover:bg-app-control-hover"
                    onClick={() => toggleOutput(output.id)}
                  >
                    <IconX className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <Button
            className="mt-4 w-full"
            variant="action"
            disabled={selectedIds.length === 0}
            onClick={() => setGateOpen(true)}
          >
            <IconSend className="size-4" />
            Review and publish
          </Button>
          {accountsStatus === "error" ? (
            <div
              role="alert"
              className="mt-3 rounded-app-control bg-app-warning-surface p-3 text-caption font-semibold text-app-warning"
            >
              Connected accounts could not be loaded. You can keep composing,
              then retry from Connected accounts before publishing.
            </div>
          ) : null}
        </aside>
      </div>

      {gateOpen ? (
        <PublishGateDialog
          outputs={selectedOutputs}
          accounts={accounts}
          accountsStatus={accountsStatus}
          onClose={() => setGateOpen(false)}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
    </div>
  )
}

function OutputCard({
  output,
  selected,
  onToggle,
}: {
  output: ContentOutput
  selected: boolean
  onToggle: () => void
}) {
  const imagePreview = output.media.find(
    (item) => item.kind === "thumbnail" || item.kind === "image"
  )?.url
  const videoPreview = output.media.find((item) => item.kind === "video")?.url
  const isVertical = output.kind === "slideshow" || output.kind === "video"
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group overflow-hidden rounded-app-control border text-left transition",
        selected
          ? "border-brand-accent ring-2 ring-brand-accent/20"
          : "border-app-panel-border hover:border-app-strong"
      )}
      onClick={onToggle}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-app-surface-subtle",
          isVertical ? "aspect-[9/16]" : "aspect-[4/3]"
        )}
      >
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt={`${output.title} preview`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : videoPreview ? (
          <video
            src={videoPreview}
            aria-label={`${output.title} video preview`}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center p-4 text-app-muted-text">
            {output.kind === "text" && output.text ? (
              <p className="line-clamp-6 text-sm leading-5 text-app-text">
                {output.text}
              </p>
            ) : (
              <OutputKindIcon kind={output.kind} className="size-8" />
            )}
          </div>
        )}
        <span
          className={cn(
            "absolute top-2 right-2 grid size-6 place-items-center rounded-full border",
            selected
              ? "border-brand-accent bg-brand-accent text-white"
              : "border-white/70 bg-black/30 text-white"
          )}
        >
          {selected ? (
            <IconCheck className="size-4" />
          ) : (
            <IconPlus className="size-4" />
          )}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 text-caption font-semibold text-app-muted-text">
          <OutputKindIcon kind={output.kind} />
          <span className="capitalize">{output.kind}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-label font-bold text-app-text">
          {output.title}
        </div>
      </div>
    </button>
  )
}

function PublishGateDialog({
  outputs,
  accounts,
  accountsStatus,
  onClose,
  onOpenSettings,
}: {
  outputs: ContentOutput[]
  accounts: ConnectedComposerAccount[]
  accountsStatus: "ready" | "empty" | "error"
  onClose: () => void
  onOpenSettings: () => void
}) {
  const [selectedAccounts, setSelectedAccounts] = useState(() =>
    accounts.map((account) => account.integrationId)
  )
  const [caption, setCaption] = useState(() =>
    outputs
      .map((output) => output.text.trim())
      .filter(Boolean)
      .join("\n\n")
  )
  const [hashtags, setHashtags] = useState("")
  const [mode, setMode] = useState<PublishMode>("draft")
  const [scheduledAt, setScheduledAt] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (selectedAccounts.length === 0) {
      toast.error("Choose at least one destination")
      return
    }
    setSubmitting(true)
    const toastId = toast.loading(
      mode === "draft" ? "Creating posts…" : "Sending posts…"
    )
    try {
      const response = await fetch("/api/publish-gates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputIds: outputs.map((output) => output.id),
          selectedAccountIds: selectedAccounts,
          mode,
          scheduledAt:
            mode === "schedule"
              ? new Date(scheduledAt).toISOString()
              : undefined,
          metadata: {
            title: outputs[0]?.title,
            caption,
            hashtags,
          },
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Publish gate failed")
      toast.success(
        mode === "draft"
          ? "Publishable drafts created"
          : mode === "now"
            ? "Published"
            : "Scheduled",
        { id: toastId }
      )
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Publish gate failed"), {
        id: toastId,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppModal onClose={onClose} className="p-2 sm:p-4">
      <AppModalPanel className="max-w-2xl">
        <AppModalHeader
          title="Publish gate"
          closeLabel="Close publish gate"
          onClose={onClose}
        />
        <div className="space-y-5 p-4 sm:p-5">
          <section>
            <h3 className="text-label font-bold text-app-text">Outputs</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {outputs.map((output) => (
                <span
                  key={output.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-app-panel-border px-2.5 py-1 text-caption font-semibold text-app-text"
                >
                  <OutputKindIcon kind={output.kind} />
                  {output.title}
                </span>
              ))}
            </div>
          </section>

          <details className="rounded-app-control border border-app-panel-border bg-app-surface-subtle p-3">
            <summary className="lc-focus-ring cursor-pointer rounded-app-control text-label font-bold text-app-text">
              Customize post copy
            </summary>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-caption font-semibold text-app-muted-text">
                Post copy
                <textarea
                  className="lc-focus-ring min-h-32 rounded-app-control border border-app-panel-border bg-app-surface px-3 py-2 text-label text-app-text"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-caption font-semibold text-app-muted-text">
                Hashtags
                <input
                  className="lc-focus-ring h-10 rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text"
                  placeholder="#astrology #zodiac"
                  value={hashtags}
                  onChange={(event) => setHashtags(event.target.value)}
                />
              </label>
            </div>
          </details>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-label font-bold text-app-text">
                Destinations
              </h3>
              {accounts.length === 0 ? (
                <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                  {accountsStatus === "error"
                    ? "Retry accounts"
                    : "Add account"}
                </Button>
              ) : null}
            </div>
            {accountsStatus === "error" ? (
              <p
                role="alert"
                className="mt-2 rounded-app-control bg-app-warning-surface p-3 text-caption font-semibold text-app-warning"
              >
                Connected accounts could not be loaded. Open Connected accounts
                to retry before publishing.
              </p>
            ) : accounts.length === 0 ? (
              <p className="mt-2 text-caption text-app-muted-text">
                Connect a publishing destination before creating posts.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {accounts.map((account) => {
                const selected = selectedAccounts.includes(
                  account.integrationId
                )
                return (
                  <button
                    key={account.integrationId}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "lc-focus-ring flex items-center gap-2 rounded-app-control border px-3 py-2 text-caption font-semibold",
                      selected
                        ? "border-brand-accent bg-brand-accent-soft text-brand-accent"
                        : "border-app-panel-border text-app-muted-text"
                    )}
                    onClick={() =>
                      setSelectedAccounts((current) =>
                        selected
                          ? current.filter((id) => id !== account.integrationId)
                          : [...current, account.integrationId]
                      )
                    }
                  >
                    <SocialPlatformIcon
                      provider={account.platformKey}
                      className="size-4"
                    />
                    {account.accountName}
                    {selected ? <IconCheck className="size-3.5" /> : null}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <label className="grid gap-1 text-caption font-semibold text-app-muted-text">
              Action
              <select
                className="lc-focus-ring h-10 rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text"
                value={mode}
                onChange={(event) => setMode(event.target.value as PublishMode)}
              >
                <option value="draft">Create draft posts</option>
                <option value="now">Publish now</option>
                <option value="schedule">Schedule</option>
              </select>
            </label>
            {mode === "schedule" ? (
              <label className="grid gap-1 text-caption font-semibold text-app-muted-text">
                Publish time
                <input
                  className="lc-focus-ring h-10 rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </label>
            ) : null}
          </section>

          <div className="flex justify-end gap-2 border-t border-app-panel-border pt-4">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="action"
              disabled={
                submitting ||
                accounts.length === 0 ||
                (mode === "schedule" && !scheduledAt)
              }
              onClick={() => void submit()}
            >
              <IconSend className="size-4" />
              {mode === "draft"
                ? "Create posts"
                : mode === "now"
                  ? "Publish now"
                  : "Schedule"}
            </Button>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function OutputKindIcon({
  kind,
  className,
}: {
  kind: ContentOutput["kind"]
  className?: string
}) {
  if (kind === "slideshow")
    return <IconPhoto className={cn("size-4", className)} />
  if (kind === "video") return <IconVideo className={cn("size-4", className)} />
  return <IconFileText className={cn("size-4", className)} />
}
