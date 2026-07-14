"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconBook2,
  IconFile,
  IconLink,
  IconNews,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconVideo,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import {
  SearchControl,
  SelectControl,
  SwitchPillButton,
} from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { fetchJsonWithTimeout, toastApiError } from "@/lib/client-api"
import type {
  KnowledgeBaseExpiry,
  KnowledgeBaseRecord,
  KnowledgeBaseSource,
  KnowledgeBaseSourceKind,
  KnowledgeBaseSourceMode,
} from "@/lib/knowledge-bases"
import { cn } from "@/lib/utils"

const expiryOptions: Array<[KnowledgeBaseExpiry, string]> = [
  ["0m", "Always"],
  ["1h", "1 hour"],
  ["24h", "24 hours"],
  ["1w", "1 week"],
  ["1mo", "1 month"],
  ["1y", "1 year"],
]
const researchKinds: Array<[KnowledgeBaseSourceKind, string]> = [
  ["link", "Web link"],
  ["youtube", "YouTube"],
  ["file", "PDF / audio"],
]
const realtimeKinds: Array<[KnowledgeBaseSourceKind, string]> = [
  ["google", "Google search"],
  ["reddit", "Reddit search"],
  ["rss", "RSS feed"],
  ["twitter", "X / Twitter"],
  ["tiktok", "TikTok search"],
]

export function KnowledgeBasesPanel() {
  const [items, setItems] = useState<KnowledgeBaseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<KnowledgeBaseRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      const payload = await fetchJsonWithTimeout<{
        knowledgeBases?: KnowledgeBaseRecord[]
      }>("/api/knowledge-bases", { toastOnError: !silent })
      setItems(payload.knowledgeBases ?? [])
      setEditing((current) =>
        current
          ? (payload.knowledgeBases?.find((item) => item.id === current.id) ??
            current)
          : null
      )
    } catch (error) {
      if (!silent) toastApiError(error, "Unable to load knowledge bases")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!items.some((item) => item.status === "refreshing")) return
    const timer = window.setInterval(() => void load(true), 4000)
    return () => window.clearInterval(timer)
  }, [items])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? items.filter((item) =>
          `${item.name} ${item.description}`.toLowerCase().includes(needle)
        )
      : items
  }, [items, query])

  function createNew() {
    const now = new Date().toISOString()
    setEditing({
      id: crypto.randomUUID(),
      name: "Untitled knowledge base",
      description: "",
      status: "idle",
      sources: [],
      compiledText: "",
      createdAt: now,
      updatedAt: now,
    })
  }

  async function save(value: KnowledgeBaseRecord, refresh = false) {
    try {
      const payload = await fetchJsonWithTimeout<{
        knowledgeBase: KnowledgeBaseRecord
      }>("/api/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
        timeoutMs: 30000,
      })
      setItems((current) => [
        payload.knowledgeBase,
        ...current.filter((item) => item.id !== value.id),
      ])
      setEditing(payload.knowledgeBase)
      if (refresh) await refreshKnowledgeBase(payload.knowledgeBase.id)
      else toast.success("Knowledge base saved")
    } catch (error) {
      toastApiError(error, "Unable to save knowledge base")
    }
  }

  async function refreshKnowledgeBase(id: string, sourceIds?: string[]) {
    try {
      const payload = await fetchJsonWithTimeout<{
        knowledgeBase: KnowledgeBaseRecord
      }>(`/api/knowledge-bases/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds }),
        timeoutMs: 30000,
      })
      setItems((current) =>
        current.map((item) => (item.id === id ? payload.knowledgeBase : item))
      )
      setEditing(payload.knowledgeBase)
      toast.success("Refresh queued")
    } catch (error) {
      toastApiError(error, "Unable to queue refresh")
    }
  }

  async function remove(id: string) {
    try {
      await fetchJsonWithTimeout(
        `/api/knowledge-bases/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      )
      setItems((current) => current.filter((item) => item.id !== id))
      if (editing?.id === id) setEditing(null)
      toast.success("Knowledge base deleted")
    } catch (error) {
      toastApiError(error, "Unable to delete knowledge base")
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <SearchControl
          className="w-full max-w-[440px]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search knowledge bases"
        />
        <Button variant="action" size="appDefault" onClick={createNew}>
          <IconPlus className="size-4" />
          New knowledge base
        </Button>
      </div>
      {loading ? (
        <CardGridSkeleton count={8} className="2xl:grid-cols-4" />
      ) : filtered.length === 0 ? (
        <button
          className="app-empty-state grid min-h-[430px] w-full place-items-center text-center"
          onClick={createNew}
        >
          <span>
            <IconBook2 className="mx-auto mb-3 size-9 text-[#e46954]" />
            <span className="block text-lg font-semibold">
              No knowledge bases yet
            </span>
            <span className="mt-2 block text-sm text-app-muted-text">
              Combine durable research with sources that refresh on a schedule.
            </span>
          </span>
        </button>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item) => {
            const research = item.sources.filter(
              (source) => source.mode === "research"
            ).length
            const realtime = item.sources.length - research
            return (
              <article
                key={item.id}
                className="group rounded-[9px] border border-app-panel-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <button
                  className="block w-full text-left"
                  onClick={() => setEditing(item)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-[#fff1ed] text-[#e46954]">
                      <IconBook2 className="size-5" />
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <h3 className="mt-4 truncate text-[16px] font-semibold text-app-text">
                    {item.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-app-muted-text">
                    {item.description || "No description"}
                  </p>
                  <div className="mt-4 flex items-center gap-3 border-t border-app-panel-border pt-3 text-[12px] font-semibold text-app-muted-text">
                    <span>{research} research</span>
                    <span>{realtime} realtime</span>
                    <span>
                      {item.compiledText.length.toLocaleString()} chars
                    </span>
                  </div>
                </button>
                <div className="mt-3 flex gap-2 opacity-0 transition group-hover:opacity-100">
                  {realtime > 0 ? (
                    <Button
                      variant="softControl"
                      size="compact"
                      onClick={() => void refreshKnowledgeBase(item.id)}
                    >
                      <IconRefresh className="size-3.5" />
                      Refresh realtime
                    </Button>
                  ) : null}
                  <Button
                    variant="iconControl"
                    size="icon-sm"
                    className="ml-auto text-app-danger"
                    onClick={() => setDeletingId(item.id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {editing ? (
        <KnowledgeBaseEditor
          value={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={save}
          onRefresh={refreshKnowledgeBase}
        />
      ) : null}
      {deletingId ? (
        <ConfirmDialog
          title="Delete this knowledge base?"
          description="This permanently removes the knowledge base, its sources, and compiled context."
          confirmLabel="Delete knowledge base"
          pendingLabel="Deleting…"
          onCancel={() => setDeletingId(null)}
          onConfirm={() => remove(deletingId)}
        />
      ) : null}
    </>
  )
}

function KnowledgeBaseEditor({
  value,
  onChange,
  onClose,
  onSave,
  onRefresh,
}: {
  value: KnowledgeBaseRecord
  onChange: (value: KnowledgeBaseRecord) => void
  onClose: () => void
  onSave: (value: KnowledgeBaseRecord, refresh?: boolean) => Promise<void>
  onRefresh: (id: string, sourceIds?: string[]) => Promise<void>
}) {
  const [tab, setTab] = useState<KnowledgeBaseSourceMode>("research")
  const [addingKind, setAddingKind] = useState<KnowledgeBaseSourceKind>("link")
  const [addingValue, setAddingValue] = useState("")
  const [uploading, setUploading] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const sources = value.sources.filter((source) => source.mode === tab)
  const kinds = tab === "research" ? researchKinds : realtimeKinds

  function patchSource(id: string, patch: Partial<KnowledgeBaseSource>) {
    onChange({
      ...value,
      sources: value.sources.map((source) =>
        source.id === id ? { ...source, ...patch } : source
      ),
    })
  }
  function addSource() {
    const sourceValue = addingValue.trim()
    if (!sourceValue) return
    const label = kinds.find(([kind]) => kind === addingKind)?.[1] ?? addingKind
    onChange({
      ...value,
      sources: [
        ...value.sources,
        {
          id: crypto.randomUUID(),
          mode: tab,
          kind: addingKind,
          label,
          value: sourceValue,
          expiry: tab === "realtime" ? "24h" : "1mo",
          enabled: true,
          status: "idle",
          chunks: [],
        },
      ],
    })
    setAddingValue("")
  }
  async function upload(file: File) {
    setUploading(true)
    try {
      await onSave(value)
      const form = new FormData()
      form.append("knowledgeBaseId", value.id)
      form.append("file", file)
      const payload = await fetchJsonWithTimeout<{
        knowledgeBase: KnowledgeBaseRecord
      }>("/api/knowledge-bases/upload", {
        method: "POST",
        body: form,
        timeoutMs: 120000,
      })
      onChange(payload.knowledgeBase)
      toast.success("File uploaded")
    } catch (error) {
      toastApiError(error, "Unable to upload file")
    } finally {
      setUploading(false)
    }
  }

  return (
    <AppModal className="z-[80]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[92vh] max-w-[980px] flex-col">
        <AppModalHeader
          title={value.name}
          description="Edit sources and refresh rules."
          onClose={onClose}
          actions={
            <Button
              variant={showDebug ? "action" : "softControl"}
              size="compact"
              onClick={() => setShowDebug((current) => !current)}
            >
              Debug
            </Button>
          }
        />
        <div className="overflow-y-auto p-6">
          <div className="max-w-[520px]">
            <Field label="Name">
              <input
                value={value.name}
                onChange={(event) =>
                  onChange({ ...value, name: event.target.value })
                }
                className="app-input w-full"
              />
            </Field>
          </div>
          <div className="mt-6 flex w-fit rounded-[7px] border border-app-panel-border bg-[#f1f0ea] p-1">
            {(["research", "realtime"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setTab(mode)
                  setAddingKind(mode === "research" ? "link" : "google")
                }}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-[5px] px-4 text-[13px] font-semibold capitalize",
                  tab === mode ? "bg-white shadow-sm" : "text-app-muted-text"
                )}
              >
                {mode === "research" ? (
                  <IconBook2 className="size-4" />
                ) : (
                  <IconNews className="size-4" />
                )}
                {mode}
              </button>
            ))}
          </div>
          <section className="mt-4 rounded-[9px] border border-app-panel-border bg-[#fafaf7] p-4">
            <div className="mb-3 text-[13px] font-semibold text-app-text">
              {tab === "research" ? "Add web source" : "Add realtime source"}
            </div>
            <div className="grid gap-2 md:grid-cols-[170px_1fr_auto]">
              <SelectControl
                value={addingKind}
                onChange={(event) =>
                  setAddingKind(event.target.value as KnowledgeBaseSourceKind)
                }
              >
                {kinds
                  .filter(([kind]) => kind !== "file")
                  .map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
              </SelectControl>
              <input
                className="app-input"
                value={addingValue}
                onChange={(event) => setAddingValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addSource()
                }}
                placeholder={
                  tab === "research" ? "https://…" : "Search query or RSS URL"
                }
              />
              <Button variant="action" size="appDefault" onClick={addSource}>
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
          </section>
          {tab === "research" ? (
            <UploadDropzone
              inputRef={fileRef}
              accept=".pdf,.mp3,.wav,application/pdf,audio/*"
              disabled={uploading}
              onFiles={(files) => {
                const file = files?.[0]
                if (file) void upload(file)
              }}
              className="mt-4 rounded-[9px] border border-dashed border-app-panel-border bg-white p-4"
            >
              <div className="mb-1 text-[13px] font-semibold text-app-text">
                Upload file
              </div>
              <p className="mb-3 text-xs font-medium text-app-muted-text">
                Add a PDF or audio file as a separate research source.
              </p>
              <Button variant="softControl" size="compact" disabled={uploading}>
                <IconUpload className="size-4" />
                {uploading ? "Uploading…" : "Choose PDF or audio"}
              </Button>
            </UploadDropzone>
          ) : null}
          <div className="mt-4 space-y-3">
            {sources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app-panel-border p-8 text-center text-sm font-semibold text-app-muted-text">
                No {tab} sources yet.
              </div>
            ) : (
              sources.map((source) => (
                <SourceEditor
                  key={source.id}
                  source={source}
                  onPatch={(patch) => patchSource(source.id, patch)}
                  onRemove={() =>
                    onChange({
                      ...value,
                      sources: value.sources.filter(
                        (item) => item.id !== source.id
                      ),
                    })
                  }
                  onRefresh={() => void onRefresh(value.id, [source.id])}
                />
              ))
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-app-panel-border px-6 py-4">
          <div className="text-xs font-semibold text-app-muted-text">
            {value.sources.length} sources ·{" "}
            {value.compiledText.length.toLocaleString()} context characters
          </div>
          <Button
            variant="action"
            size="appDefault"
            onClick={() => void onSave(value)}
          >
            Save changes
          </Button>
        </div>
      </AppModalPanel>
      {showDebug ? (
        <KnowledgeBaseDebugModal
          value={value}
          onClose={() => setShowDebug(false)}
        />
      ) : null}
    </AppModal>
  )
}

function SourceEditor({
  source,
  onPatch,
  onRemove,
  onRefresh,
}: {
  source: KnowledgeBaseSource
  onPatch: (patch: Partial<KnowledgeBaseSource>) => void
  onRemove: () => void
  onRefresh: () => void
}) {
  const Icon =
    source.kind === "youtube"
      ? IconVideo
      : source.kind === "file"
        ? IconFile
        : source.kind === "link" || source.kind === "rss"
          ? IconLink
          : IconNews
  return (
    <div className="rounded-lg border border-app-panel-border bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-md bg-app-surface-subtle">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "grid gap-2",
              source.mode === "realtime" && "md:grid-cols-[1fr_170px]"
            )}
          >
            <input
              className="app-input"
              value={source.label}
              onChange={(event) => onPatch({ label: event.target.value })}
            />
            {source.mode === "realtime" ? (
              <SelectControl
                value={source.expiry}
                onChange={(event) =>
                  onPatch({ expiry: event.target.value as KnowledgeBaseExpiry })
                }
              >
                {expiryOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    Refresh: {label}
                  </option>
                ))}
              </SelectControl>
            ) : null}
          </div>
          {source.kind !== "file" ? (
            <input
              className="app-input mt-2 w-full font-mono text-xs"
              value={source.value}
              onChange={(event) => onPatch({ value: event.target.value })}
            />
          ) : (
            <div className="mt-2 text-xs font-semibold text-app-muted-text">
              {source.fileName}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge status={source.status} />
            {source.mode === "realtime" && source.lastScrapedAt ? (
              <span className="text-[11px] text-app-muted-text">
                Last refreshed {new Date(source.lastScrapedAt).toLocaleString()}
              </span>
            ) : null}
            {source.error ? (
              <span
                className="truncate text-[11px] font-semibold text-app-danger"
                title={source.error}
              >
                {source.error}
              </span>
            ) : null}
          </div>
        </div>
        <SwitchPillButton
          enabled={source.enabled}
          onClick={() => onPatch({ enabled: !source.enabled })}
        />
        {source.mode === "realtime" ? (
          <Button
            variant="iconControl"
            size="icon-sm"
            onClick={onRefresh}
            aria-label="Refresh source"
          >
            <IconRefresh className="size-4" />
          </Button>
        ) : null}
        <Button
          variant="iconControl"
          size="icon-sm"
          className="text-app-danger"
          onClick={onRemove}
          aria-label="Delete source"
        >
          <IconTrash className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function KnowledgeBaseDebugModal({
  value,
  onClose,
}: {
  value: KnowledgeBaseRecord
  onClose: () => void
}) {
  const realtimeSources = value.sources.filter(
    (source) => source.mode === "realtime"
  )
  return (
    <AppModal className="z-[90]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[86vh] max-w-[860px] flex-col">
        <AppModalHeader
          title="Refresh debug"
          description={
            value.lastRefreshedAt
              ? `Last refresh completed ${new Date(value.lastRefreshedAt).toLocaleString()}`
              : "No refresh has completed yet."
          }
          onClose={onClose}
        />
        <div className="space-y-4 overflow-y-auto p-6">
          {realtimeSources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app-panel-border p-8 text-center text-sm font-semibold text-app-muted-text">
              No realtime sources to refresh.
            </div>
          ) : (
            realtimeSources.map((source) => (
              <section
                key={source.id}
                className="rounded-lg border border-app-panel-border bg-[#fafaf7] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-app-text">
                      {source.label}
                    </h3>
                    <p className="mt-1 text-xs text-app-muted-text">
                      {source.lastScrapedAt
                        ? `Last refreshed ${new Date(source.lastScrapedAt).toLocaleString()}`
                        : "Never refreshed"}
                    </p>
                  </div>
                  <StatusBadge status={source.status} />
                </div>
                {source.error ? (
                  <pre className="mt-3 rounded-md bg-red-50 p-3 text-xs whitespace-pre-wrap text-red-700">
                    {source.error}
                  </pre>
                ) : null}
                <div className="mt-3 space-y-3">
                  {source.chunks.length ? (
                    source.chunks.map((chunk) => (
                      <article
                        key={chunk.id}
                        className="rounded-md border border-app-panel-border bg-white p-3"
                      >
                        <div className="text-xs font-semibold text-app-text">
                          {chunk.title || "Refresh result"}
                        </div>
                        <div className="mt-1 text-[11px] text-app-muted-text">
                          {new Date(chunk.generatedAt).toLocaleString()}
                          {chunk.url ? ` · ${chunk.url}` : ""}
                        </div>
                        <pre className="mt-3 max-h-56 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap text-app-text">
                          {chunk.text}
                        </pre>
                      </article>
                    ))
                  ) : (
                    <div className="text-xs font-medium text-app-muted-text">
                      No result was saved for this source.
                    </div>
                  )}
                </div>
              </section>
            ))
          )}
          <section>
            <div className="mb-2 text-xs font-semibold text-app-muted-text">
              Compiled output
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-app-panel-border bg-[#111117] p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-white">
              {value.compiledText || "No compiled output yet."}
            </pre>
          </section>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function StatusBadge({
  status,
}: {
  status: KnowledgeBaseRecord["status"] | KnowledgeBaseSource["status"]
}) {
  const tone =
    status === "ready"
      ? "bg-emerald-50 text-emerald-700"
      : status === "error"
        ? "bg-red-50 text-red-700"
        : status === "refreshing" ||
            status === "processing" ||
            status === "queued"
          ? "bg-amber-50 text-amber-700"
          : "bg-[#f1f0ea] text-app-muted-text"
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[10px] font-bold tracking-wide uppercase",
        tone
      )}
    >
      {status}
    </span>
  )
}
function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-app-muted-text">
        {label}
      </span>
      {children}
    </label>
  )
}
