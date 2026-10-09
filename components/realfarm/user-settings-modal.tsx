"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCheck, IconCopy, IconKey, IconPlugConnected, IconTrash } from "@tabler/icons-react"

import {
  createApiKey,
  getPublisherStatus,
  getReminderSettings,
  listApiKeys,
  listPublisherAccounts,
  revokeApiKey,
  saveReminderSettings,
  type ApiKeyView,
} from "@/components/realfarm/api-client"
import { McpSettingsPanel } from "@/components/realfarm/mcp-settings-panel"
import { PublisherNotConnected } from "@/components/realfarm/publish/publish-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { IconButton } from "@/components/ui/icon-button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { API_KEY_SCOPES, type ApiKeyScope, type ReminderSettings } from "@/lib/data/types"
import { cn } from "@/lib/utils"

export type WorkspaceSettingsTab = "api-keys" | "socialbu" | "mcp" | "reminders"

export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = [
  "renders:read",
  "renders:write",
  "templates:read",
  "media:read",
]

const LEAD_TIME_OPTIONS = [
  { minutes: 15, label: "15 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 24 * 60, label: "1 day before" },
]

export function UserSettingsModal({
  onClose,
  initialTab = "api-keys",
}: {
  onClose: () => void
  initialTab?: WorkspaceSettingsTab
}) {
  const [tab, setTab] = useState<WorkspaceSettingsTab>(initialTab)
  return (
    <AppModal className="z-[100]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[calc(100svh-2rem)] w-[min(880px,calc(100vw-24px))] flex-col overflow-hidden p-0">
        <AppModalHeader title="Settings" closeLabel="Close settings" onClose={onClose} />
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as WorkspaceSettingsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="overflow-x-auto px-5">
            <TabsTrigger value="api-keys">API keys</TabsTrigger>
            <TabsTrigger value="socialbu">SocialBu</TabsTrigger>
            <TabsTrigger value="mcp">MCP</TabsTrigger>
            <TabsTrigger value="reminders">Reminders</TabsTrigger>
          </TabsList>
          <div className="min-h-[420px] flex-1 overflow-y-auto p-5 sm:p-6">
            <TabsContent value="api-keys">
              <ApiKeysPanel />
            </TabsContent>
            <TabsContent value="socialbu">
              <SocialBuPanel />
            </TabsContent>
            <TabsContent value="mcp">
              <McpSettingsPanel />
            </TabsContent>
            <TabsContent value="reminders">
              <RemindersPanel />
            </TabsContent>
          </div>
        </Tabs>
      </AppModalPanel>
    </AppModal>
  )
}

function PanelHeading({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-app-text">{title}</h2>
      {actions}
    </div>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return "Never"
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? "Never"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function ApiKeysPanel() {
  const queryClient = useQueryClient()
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: listApiKeys, retry: false })
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<ApiKeyScope[]>(DEFAULT_API_KEY_SCOPES)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null)

  async function create() {
    if (!name.trim()) {
      setError("Name the key.")
      return
    }
    if (scopes.length === 0) {
      setError("Choose at least one scope.")
      return
    }
    setCreating(true)
    setError("")
    try {
      const created = await createApiKey({ name: name.trim(), scopes })
      setSecret({ name: created.key.name, value: created.secret })
      setCopied(false)
      setName("")
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The key could not be created.")
    } finally {
      setCreating(false)
    }
  }

  const active = (keys.data ?? []).filter((key) => !key.revokedAt)

  return (
    <div className="space-y-6">
      <PanelHeading title="API keys" />
      {secret ? (
        <div role="status" className="space-y-2 rounded-xl border border-app-action/30 bg-app-action/5 p-4">
          <p className="text-sm font-semibold text-app-text">
            Copy “{secret.name}” now. It will not be shown again.
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] bg-app-control-bg px-3 py-2 font-mono text-xs text-app-text">
              {secret.value}
            </code>
            <IconButton
              label={copied ? "Copied" : "Copy API key"}
              variant="softControl"
              onClick={async () => {
                await navigator.clipboard.writeText(secret.value).catch(() => undefined)
                setCopied(true)
              }}
            >
              {copied ? <IconCheck /> : <IconCopy />}
            </IconButton>
          </div>
          <Button type="button" variant="ghost" size="compact" onClick={() => setSecret(null)}>
            Done
          </Button>
        </div>
      ) : null}

      <form
        className="space-y-3 rounded-xl border border-app-panel-border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-app-text">Key name</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Render script"
            className="h-9 w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm outline-none focus:border-app-action"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-app-text">Scopes</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 font-mono text-xs text-app-text">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked ? [...current, scope] : current.filter((s) => s !== scope)
                    )
                  }
                  className="size-4 accent-[var(--app-action)]"
                />
                {scope}
              </label>
            ))}
          </div>
        </fieldset>
        {error ? <p role="alert" className="text-sm font-medium text-app-danger">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="action" size="appDefault" className="min-w-[132px]" disabled={creating}>
            <IconKey />
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>
      </form>

      {keys.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-app-surface-subtle" />
      ) : keys.error ? (
        <p role="alert" className="text-sm text-app-danger">API keys could not be loaded.</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-app-muted-text">No API keys yet.</p>
      ) : (
        <ul className="divide-y divide-app-panel-border rounded-xl border border-app-panel-border">
          {active.map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-app-text">{key.name}</p>
                <p className="truncate font-mono text-[11px] text-app-muted-text">
                  {key.prefix}… · {key.scopes.join(", ")}
                </p>
                <p className="text-[11px] text-app-muted-text">
                  Created {formatDate(key.createdAt)} · Last used {formatDate(key.lastUsedAt)}
                </p>
              </div>
              <IconButton label={`Revoke ${key.name}`} onClick={() => setRevoking(key)}>
                <IconTrash />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {revoking ? (
        <ConfirmDialog
          title={`Revoke “${revoking.name}”?`}
          description="Scripts and MCP clients using this key stop working immediately."
          confirmLabel="Revoke key"
          pendingLabel="Revoking…"
          onCancel={() => setRevoking(null)}
          onConfirm={async () => {
            await revokeApiKey(revoking.id)
            await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
          }}
        />
      ) : null}
    </div>
  )
}

function SocialBuPanel() {
  const status = useQuery({ queryKey: ["publisher-status"], queryFn: getPublisherStatus, retry: false })
  const configured = status.data?.configured === true
  const accounts = useQuery({
    queryKey: ["publisher-accounts"],
    queryFn: listPublisherAccounts,
    enabled: configured,
    retry: false,
  })

  return (
    <div>
      <PanelHeading title="SocialBu" />
      {status.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-app-surface-subtle" />
      ) : status.error ? (
        <p role="alert" className="text-sm text-app-danger">The connection status could not be loaded.</p>
      ) : !status.data || !status.data.configured ? (
        <PublisherNotConnected message={status.data?.message ?? "SocialBu not connected"} />
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-app-success">
            <IconPlugConnected className="size-4" />
            SocialBu connected
          </p>
          {accounts.isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-app-surface-subtle" />
          ) : accounts.error ? (
            <p role="alert" className="text-sm text-app-danger">Accounts could not be loaded.</p>
          ) : (
            <ul className="divide-y divide-app-panel-border rounded-xl border border-app-panel-border">
              {(accounts.data ?? []).map((account) => (
                <li key={account.id} className="flex items-center gap-3 px-4 py-3">
                  {account.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- provider avatar
                    <img src={account.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-app-text">{account.name}</p>
                    <p className="text-xs capitalize text-app-muted-text">{account.provider}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      account.active
                        ? "bg-app-success-surface text-app-success"
                        : "bg-app-danger-surface text-app-danger-muted"
                    )}
                  >
                    {account.active ? "Active" : "Disconnected"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function RemindersPanel() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ["reminders"], queryFn: getReminderSettings, retry: false })
  const [draft, setDraft] = useState<ReminderSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const current = draft ?? settings.data ?? null
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settings.data)

  async function save() {
    if (!current) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const saved = await saveReminderSettings(current)
      queryClient.setQueryData(["reminders"], saved)
      setDraft(null)
      setMessage("Reminder settings saved.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reminder settings could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelHeading
        title="Reminders"
        actions={
          <Button
            type="button"
            variant="action"
            size="appDefault"
            className="min-w-[96px]"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        }
      />
      {settings.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-app-surface-subtle" />
      ) : settings.error || !current ? (
        <p role="alert" className="text-sm text-app-danger">Reminder settings could not be loaded.</p>
      ) : (
        <div className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-app-text">Scheduled post reminders</legend>
            {(
              [
                [true, "In-app"],
                [false, "None"],
              ] as const
            ).map(([enabled, label]) => (
              <label key={label} className="flex items-center gap-2 text-sm text-app-text">
                <input
                  type="radio"
                  name="reminder-channel"
                  checked={current.enabled === enabled}
                  onChange={() => {
                    setDraft({ ...current, enabled })
                    setMessage("")
                  }}
                  className="size-4 accent-[var(--app-action)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2" disabled={!current.enabled}>
            <legend className="mb-2 text-sm font-semibold text-app-text">Remind me</legend>
            {LEAD_TIME_OPTIONS.map((option) => (
              <label
                key={option.minutes}
                className={cn("flex items-center gap-2 text-sm text-app-text", !current.enabled && "opacity-50")}
              >
                <input
                  type="checkbox"
                  checked={current.leadMinutes.includes(option.minutes)}
                  onChange={(event) => {
                    const leadMinutes = event.target.checked
                      ? [...current.leadMinutes, option.minutes].sort((a, b) => a - b)
                      : current.leadMinutes.filter((m) => m !== option.minutes)
                    setDraft({ ...current, leadMinutes })
                    setMessage("")
                  }}
                  className="size-4 accent-[var(--app-action)]"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {error ? <p role="alert" className="text-sm font-medium text-app-danger">{error}</p> : null}
          {message ? <p role="status" className="text-sm font-medium text-app-success">{message}</p> : null}
        </div>
      )}
    </div>
  )
}
