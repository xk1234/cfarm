"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconArrowLeft,
  IconEye,
  IconPlugConnectedX,
  IconStack2,
  IconUpload,
} from "@tabler/icons-react"

import {
  ApiClientError,
  createBatchRemote,
  getPublisherStatus,
  listPublisherAccounts,
  listTemplates,
  previewBatch,
  type BatchPlanView,
  type BatchRequestInput,
} from "@/components/realfarm/api-client"
import { tiktokPrivacyOptions } from "@/components/realfarm/publish/publish-dialog"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { cn } from "@/lib/utils"

import {
  buildBatchRequest,
  EMPTY_BATCH_FORM,
  exampleItemsJson,
  type BatchFormState,
} from "./batch-form"

const DRAFT_KEY = "lumenclip.new-batch-draft"

const fieldClass =
  "h-9 w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm outline-none focus:border-app-action"
const labelClass = "block space-y-1.5"
const labelText = "text-sm font-semibold text-app-text"

function todayLocal() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function initialForm(): BatchFormState {
  let draft: Partial<BatchFormState> = {}
  try {
    draft = JSON.parse(
      window.localStorage.getItem(DRAFT_KEY) ?? "{}"
    ) as Partial<BatchFormState>
  } catch {
    draft = {}
  }
  return {
    ...EMPTY_BATCH_FORM,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    startDate: todayLocal(),
    ...draft,
  }
}

function newIdempotencyKey() {
  return `ui-batch-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`
}

export function NewBatchView({
  onBack,
  onCreated,
  onOpenSettings,
}: {
  onBack: () => void
  onCreated: (batchId: string) => void
  onOpenSettings?: () => void
}) {
  // Rendered client-only (see realfarm-workspace), so the browser's timezone,
  // today's date and the autosaved draft can seed the initial state.
  const [form, setForm] = useState<BatchFormState>(initialForm)
  const [preview, setPreview] = useState<{
    plan: BatchPlanView
    requestKey: string
  } | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState<"preview" | "create" | null>(null)
  const idempotencyKey = useRef(newIdempotencyKey())
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
    retry: false,
    staleTime: 60_000,
  })
  const status = useQuery({
    queryKey: ["publisher-status"],
    queryFn: getPublisherStatus,
    retry: false,
  })
  const connected = status.data?.configured === true
  const accounts = useQuery({
    queryKey: ["publisher-accounts"],
    queryFn: listPublisherAccounts,
    enabled: connected,
    retry: false,
  })
  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((account) => account.active),
    [accounts.data]
  )
  const accountNames = useMemo(
    () => new Map(activeAccounts.map((a) => [a.id, a.name])),
    [activeAccounts]
  )
  const hasTikTok = connected
    ? activeAccounts.some(
        (a) => a.provider === "tiktok" && form.accountIds.includes(a.id)
      )
    : true
  const privacyOptions = useMemo(
    () => tiktokPrivacyOptions(activeAccounts),
    [activeAccounts]
  )
  const template = templates.data?.find((t) => t.id === form.templateId) ?? null

  // Autosave the draft inputs.
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    } catch {
      // Private mode / storage disabled: the draft simply is not kept.
    }
  }, [form])

  function patch(next: Partial<BatchFormState>) {
    setForm((current) => ({ ...current, ...next }))
    setError("")
  }

  const built = buildBatchRequest(form, { connected })
  const requestKey = built.ok ? JSON.stringify(built.request) : ""
  const previewCurrent = !!preview && preview.requestKey === requestKey
  const canCreate = previewCurrent && preview.plan.ok && pending === null

  async function runPreview() {
    if (!built.ok) {
      setError(built.error)
      return
    }
    setPending("preview")
    setError("")
    try {
      const plan = await previewBatch(built.request)
      setPreview({ plan, requestKey })
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : "Preview failed."
      )
    } finally {
      setPending(null)
    }
  }

  async function create() {
    if (!built.ok || !canCreate) return
    setPending("create")
    setError("")
    const request: BatchRequestInput = {
      ...built.request,
      idempotencyKey: idempotencyKey.current,
    }
    try {
      const batch = await createBatchRemote(request)
      try {
        window.localStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      idempotencyKey.current = newIdempotencyKey()
      await queryClient.invalidateQueries({ queryKey: ["batches"] })
      onCreated(batch.id)
    } catch (createError) {
      const body =
        createError instanceof ApiClientError
          ? (createError.body as { preview?: BatchPlanView } | null)
          : null
      if (body?.preview) setPreview({ plan: body.preview, requestKey })
      setError(
        createError instanceof Error
          ? createError.message
          : "The batch could not be created."
      )
      setPending(null)
    }
  }

  async function loadFile(file: File) {
    const text = await file.text()
    patch({ itemsText: text })
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to batches" onClick={onBack}>
            <IconArrowLeft />
          </IconButton>
          <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-app-text">
            New batch
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="softControl"
            size="appDefault"
            className="min-w-[116px]"
            disabled={pending !== null}
            onClick={() => void runPreview()}
          >
            <IconEye />
            {pending === "preview" ? "Previewing…" : "Preview"}
          </Button>
          <Button
            type="button"
            variant="action"
            size="appDefault"
            className="min-w-[140px]"
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : "Preview the current inputs without errors first"
            }
            onClick={() => void create()}
          >
            <IconStack2 />
            {pending === "create" ? "Creating…" : "Create batch"}
          </Button>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-4" aria-labelledby="batch-content">
          <h2
            id="batch-content"
            className="text-base font-semibold text-app-text"
          >
            Content
          </h2>
          <label className={labelClass}>
            <span className={labelText}>Name</span>
            <input
              className={fieldClass}
              value={form.name}
              placeholder={template ? `${template.name} batch` : "Batch name"}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          <label className={labelClass}>
            <span className={labelText}>Template</span>
            <select
              className={fieldClass}
              value={form.templateId}
              onChange={(event) => patch({ templateId: event.target.value })}
            >
              <option value="">
                {templates.isLoading
                  ? "Loading templates…"
                  : "Choose a template"}
              </option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="batch-items" className={labelText}>
                Items (JSON or CSV)
              </label>
              <Button
                type="button"
                variant="softControl"
                size="appDefault"
                onClick={() => fileInput.current?.click()}
              >
                <IconUpload />
                Upload file
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="sr-only"
                aria-label="Upload items file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void loadFile(file)
                  event.target.value = ""
                }}
              />
            </div>
            <textarea
              id="batch-items"
              value={form.itemsText}
              rows={14}
              spellCheck={false}
              placeholder={exampleItemsJson(template?.spec)}
              onChange={(event) => patch({ itemsText: event.target.value })}
              className="w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 py-2 font-mono text-xs outline-none focus:border-app-action"
            />
          </div>
        </section>

        <section className="min-w-0 space-y-4" aria-labelledby="batch-schedule">
          <h2
            id="batch-schedule"
            className="text-base font-semibold text-app-text"
          >
            Schedule
          </h2>
          <fieldset className="space-y-2">
            <legend className={cn(labelText, "mb-2")}>Accounts</legend>
            {status.isLoading ? (
              <div
                className="h-12 animate-pulse rounded-xl bg-app-surface-subtle"
                aria-busy="true"
              />
            ) : !connected ? (
              <div className="space-y-2">
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-xl bg-app-warning-surface px-3 py-2 text-sm text-app-warning"
                >
                  <IconPlugConnectedX className="mt-0.5 size-4 shrink-0" />
                  <span>
                    SocialBu not connected. Items still render; scheduling fails
                    until SocialBu is connected.
                    {onOpenSettings ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="font-semibold underline"
                          onClick={onOpenSettings}
                        >
                          Open settings
                        </button>
                      </>
                    ) : null}
                  </span>
                </p>
                <label className={labelClass}>
                  <span className={labelText}>Account IDs</span>
                  <input
                    className={fieldClass}
                    value={form.manualAccountIds}
                    placeholder="101, 202"
                    onChange={(event) =>
                      patch({ manualAccountIds: event.target.value })
                    }
                  />
                </label>
              </div>
            ) : accounts.isLoading ? (
              <div
                className="h-12 animate-pulse rounded-xl bg-app-surface-subtle"
                aria-busy="true"
              />
            ) : activeAccounts.length === 0 ? (
              <p className="text-sm text-app-muted-text">
                No connected accounts in SocialBu.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {activeAccounts.map((account) => {
                  const checked = form.accountIds.includes(account.id)
                  return (
                    <li key={account.id}>
                      <label
                        className={cn(
                          "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
                          checked
                            ? "border-app-action bg-app-action/5"
                            : "border-app-panel-border"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            patch({
                              accountIds: event.target.checked
                                ? [...form.accountIds, account.id]
                                : form.accountIds.filter(
                                    (id) => id !== account.id
                                  ),
                            })
                          }
                          className="size-4 accent-[var(--app-action)]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-app-text">
                            {account.name}
                          </span>
                          <span className="block text-xs text-app-muted-text capitalize">
                            {account.provider}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              <span className={labelText}>Timezone</span>
              <input
                className={fieldClass}
                value={form.timezone}
                onChange={(event) => patch({ timezone: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              <span className={labelText}>Start date</span>
              <input
                type="date"
                className={fieldClass}
                value={form.startDate}
                onChange={(event) => patch({ startDate: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              <span className={labelText}>Times of day</span>
              <input
                className={fieldClass}
                value={form.timesOfDay}
                placeholder="09:00, 13:00, 19:00"
                onChange={(event) => patch({ timesOfDay: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              <span className={labelText}>Max posts per account per day</span>
              <input
                type="number"
                min={1}
                max={24}
                className={fieldClass}
                value={form.maxPerAccountPerDay}
                onChange={(event) =>
                  patch({ maxPerAccountPerDay: event.target.value })
                }
              />
            </label>
            <label className={labelClass}>
              <span className={labelText}>Jitter (max minutes)</span>
              <input
                type="number"
                min={0}
                max={120}
                className={fieldClass}
                value={form.jitterMaxMinutes}
                onChange={(event) =>
                  patch({ jitterMaxMinutes: event.target.value })
                }
              />
            </label>
            {hasTikTok ? (
              <label className={labelClass}>
                <span className={labelText}>TikTok privacy</span>
                <select
                  className={fieldClass}
                  value={form.privacyStatus}
                  onChange={(event) =>
                    patch({ privacyStatus: event.target.value })
                  }
                >
                  <option value="">Default (public)</option>
                  {privacyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className={cn(labelText, "mb-2")}>Post as</legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ["schedule", "Scheduled posts"],
                  ["draft", "TikTok drafts"],
                ] as const
              ).map(([mode, label]) => (
                <label
                  key={mode}
                  className="flex items-center gap-2 text-sm font-medium text-app-text"
                >
                  <input
                    type="radio"
                    name="batch-mode"
                    checked={form.mode === mode}
                    onChange={() => patch({ mode })}
                    className="size-4 accent-[var(--app-action)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      </div>

      {preview ? (
        <PreviewTable
          plan={preview.plan}
          stale={!previewCurrent}
          accountNames={accountNames}
        />
      ) : null}
    </div>
  )
}

function PreviewTable({
  plan,
  stale,
  accountNames,
}: {
  plan: BatchPlanView
  stale: boolean
  accountNames: Map<string, string>
}) {
  const timezone =
    (plan.schedule as { timezone?: string } | null)?.timezone ?? ""
  return (
    <section className="space-y-3" aria-labelledby="batch-preview">
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="batch-preview"
          className="text-base font-semibold text-app-text"
        >
          Preview
        </h2>
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold",
            plan.ok
              ? "bg-app-success-surface text-app-success"
              : "bg-app-danger-surface text-app-danger-muted"
          )}
        >
          {plan.ok
            ? `${plan.items.length} items ready`
            : `${plan.errorCount} error${plan.errorCount === 1 ? "" : "s"}`}
        </span>
        {stale ? (
          <span className="text-xs text-app-muted-text">
            Inputs changed since this preview.
          </span>
        ) : null}
      </div>
      {plan.errors.length ? (
        <ul
          role="alert"
          className="space-y-1 rounded-xl bg-app-danger-surface p-3 text-sm text-app-danger-muted"
        >
          {plan.errors.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>
              <span className="font-mono text-xs">{issue.path || "/"}</span>{" "}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {plan.warnings.length ? (
        <ul
          role="status"
          className="space-y-1 rounded-xl bg-app-warning-surface p-3 text-sm text-app-warning"
        >
          {plan.warnings.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {plan.items.length ? (
        <div className="overflow-x-auto rounded-xl border border-app-panel-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-app-surface-subtle text-xs text-app-muted-text">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Account</th>
                <th className="px-3 py-2 font-semibold">
                  Publishes{timezone ? ` (${timezone})` : ""}
                </th>
                <th className="px-3 py-2 font-semibold">Slides</th>
                <th className="px-3 py-2 font-semibold">Caption</th>
                <th className="px-3 py-2 font-semibold">Check</th>
              </tr>
            </thead>
            <tbody>
              {plan.items.map((item) => (
                <tr
                  key={item.index}
                  className="border-t border-app-panel-border align-top"
                >
                  <td className="px-3 py-2 tabular-nums">{item.index + 1}</td>
                  <td className="px-3 py-2">
                    {item.accountId
                      ? (accountNames.get(item.accountId) ?? item.accountId)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {item.localTime ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {item.slideCount ?? "—"}
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    <span className="line-clamp-2 break-words">
                      {item.caption || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {item.errors.length ? (
                      <ul className="space-y-1 text-xs text-app-danger-muted">
                        {item.errors.map((issue, index) => (
                          <li key={`${issue.path}-${index}`}>
                            <span className="font-mono">{issue.path}</span>{" "}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs font-semibold text-app-success">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
