"use client"

import { useEffect, useState } from "react"
import {
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandYoutube,
  IconApi,
  IconCheck,
  IconExternalLink,
  IconPlus,
  IconRefresh,
  IconBell,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { useDirtyGuard } from "@/components/ui/use-dirty-guard"
import { ListSkeleton } from "@/components/ui/loading-skeleton"
import { normalizeSocialBuSocialIntegration } from "@/lib/social/socialbu-adapter"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import { clientQueryFetcher } from "@/lib/client-fetcher"
import { useAppQuery } from "@/lib/client-query"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { cn } from "@/lib/utils"
import { McpSettingsPanel } from "@/components/realfarm/mcp-settings-panel"

export type WorkspaceSettingsTab = "accounts" | "reminders" | "mcp"
// Notifications are delivered in-app only; there is no external channel.
type ReminderChannel = "none" | "in_app"
type ReminderEventSettings = {
  channel: ReminderChannel | string
  offsetsHours?: number[]
}
type ReminderSettings = {
  notificationDefaultsApplied?: boolean
  events: Record<string, ReminderEventSettings>
}
type ReminderResponse = {
  settings: ReminderSettings
  eventMetadata: Record<
    string,
    {
      label: string
      description: string
      supportsOffsets: boolean
      defaultOffsetsHours?: number[]
    }
  >
}

const tabs = [
  { id: "accounts", label: "Connected accounts", icon: IconExternalLink },
  { id: "reminders", label: "Notifications", icon: IconBell },
  { id: "mcp", label: "MCP", icon: IconApi },
] as const

export function UserSettingsModal({
  onClose,
  onSocialAccountDisconnected,
  initialTab = "accounts",
}: {
  onClose: () => void
  onSocialAccountDisconnected?: (integrationId: string) => void
  initialTab?: WorkspaceSettingsTab
}) {
  const [tab, setTab] = useState<WorkspaceSettingsTab>(initialTab)
  const [remindersDirty, setRemindersDirty] = useState(false)
  const dirtyGuard = useDirtyGuard(remindersDirty)

  function requestClose() {
    dirtyGuard.run(onClose)
  }

  function selectTab(nextTab: WorkspaceSettingsTab) {
    if (nextTab === tab) return
    dirtyGuard.run(() => {
      setRemindersDirty(false)
      setTab(nextTab)
    })
  }

  return (
    <>
      <AppModal className="z-[100] bg-[#242136]/45" onClose={requestClose}>
        <AppModalPanel className="max-h-[calc(100vh-2rem)] max-w-[980px] overflow-hidden p-0">
          <AppModalHeader
            title="Workspace settings"
            closeLabel="Close settings"
            onClose={requestClose}
          />
          <div className="grid h-[calc(100vh-7rem)] max-h-[600px] min-h-0 md:grid-cols-[220px_1fr]">
            <nav className="flex gap-1 overflow-x-auto border-b border-app-panel-border bg-[#fafafd] p-3 md:block md:overflow-y-auto md:border-r md:border-b-0">
              {tabs.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => selectTab(item.id)}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-medium md:mb-1 md:w-full",
                      tab === item.id
                        ? "bg-app-strong text-white"
                        : "text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
            <div className="min-w-0 overflow-y-auto p-6 sm:p-8">
              {tab === "accounts" && (
                <AccountsPanel
                  onSocialAccountDisconnected={onSocialAccountDisconnected}
                />
              )}
              {tab === "reminders" && (
                <RemindersPanel onDirtyChange={setRemindersDirty} />
              )}
              {tab === "mcp" && <McpSettingsPanel />}
            </div>
          </div>
        </AppModalPanel>
      </AppModal>
      {dirtyGuard.confirmation}
    </>
  )
}

function RemindersPanel({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void
}) {
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useAppQuery<ReminderResponse>(
    "/api/settings/reminders",
    clientQueryFetcher
  )
  const [draft, setDraft] = useState<ReminderSettings | null>(null)
  const [pending, setPending] = useState<"save" | "">("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const settings = draft ?? data?.settings ?? null
  const dirty = Boolean(
    draft &&
    data?.settings &&
    JSON.stringify(draft) !== JSON.stringify(data.settings)
  )

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  function edit(update: (current: ReminderSettings) => ReminderSettings) {
    if (settings) setDraft(update(settings))
  }

  function setAllNotifications(channel: ReminderChannel) {
    edit((current) => ({
      ...current,
      notificationDefaultsApplied: true,
      events: Object.fromEntries(
        Object.entries(current.events).map(([event, eventSettings]) => [
          event,
          { ...eventSettings, channel },
        ])
      ) as ReminderSettings["events"],
    }))
  }

  async function save() {
    if (!settings) return
    setPending("save")
    setError("")
    setMessage("")
    try {
      const payload = await fetchJsonWithTimeout<ReminderResponse>(
        "/api/settings/reminders",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
          toastOnError: false,
        }
      )
      setDraft(payload.settings)
      await mutate(payload, false)
      setMessage("Notification settings saved.")
    } catch (saveError) {
      setError(
        getApiErrorMessage(
          saveError,
          "Notification settings could not be saved."
        )
      )
    } finally {
      setPending("")
    }
  }

  return (
    <div>
      <PanelHeading title="Notifications" />
      {loadError && !settings ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-destructive">
            Notification settings could not be loaded.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => void mutate()}
          >
            Try again
          </Button>
        </div>
      ) : isLoading || !settings ? (
        <ListSkeleton count={4} className="border-y border-app-panel-border" />
      ) : (
        <div className="space-y-7">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Notify me when</h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="softControl"
                  size="compact"
                  onClick={() => setAllNotifications("in_app")}
                >
                  Turn all on
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="compact"
                  onClick={() => setAllNotifications("none")}
                >
                  Turn all off
                </Button>
              </div>
            </div>
            <div className="mt-3 divide-y divide-app-panel-border rounded-xl border border-app-panel-border">
              {data?.eventMetadata
                ? Object.entries(data.eventMetadata).map(
                    ([event, metadata]) => {
                      const eventId = event
                      const eventSettings = settings.events[eventId] ?? {
                        channel: "none",
                      }
                      return (
                        <div
                          key={eventId}
                          className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {metadata.label}
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-app-text-faint">
                              {metadata.description}
                            </p>
                            {metadata.supportsOffsets ? (
                              <div
                                className="mt-3 flex flex-wrap gap-2"
                                aria-label={`${metadata.label} timing`}
                              >
                                {(metadata.defaultOffsetsHours ?? []).map(
                                  (offsetHours) => {
                                    const selected =
                                      eventSettings.offsetsHours?.includes(
                                        offsetHours
                                      ) ?? false
                                    return (
                                      <button
                                        key={offsetHours}
                                        type="button"
                                        disabled={
                                          eventSettings.channel === "none"
                                        }
                                        aria-pressed={selected}
                                        onClick={() =>
                                          edit((current) => {
                                            const offsets =
                                              current.events[eventId]
                                                .offsetsHours ?? []
                                            return {
                                              ...current,
                                              events: {
                                                ...current.events,
                                                [eventId]: {
                                                  ...current.events[eventId],
                                                  offsetsHours: selected
                                                    ? offsets.filter(
                                                        (value) =>
                                                          value !== offsetHours
                                                      )
                                                    : [
                                                        ...offsets,
                                                        offsetHours,
                                                      ].sort(
                                                        (left, right) =>
                                                          left - right
                                                      ),
                                                },
                                              },
                                            }
                                          })
                                        }
                                        className={cn(
                                          "min-h-10 rounded-control border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-app-action/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
                                          selected
                                            ? "border-app-action bg-app-action text-white"
                                            : "border-app-panel-border bg-background text-app-muted-text hover:bg-app-control-hover"
                                        )}
                                      >
                                        {offsetHours / 24}{" "}
                                        {offsetHours === 24 ? "day" : "days"}
                                      </button>
                                    )
                                  }
                                )}
                              </div>
                            ) : null}
                          </div>
                          <label className="text-xs font-medium text-app-muted-text">
                            Channel
                            <select
                              aria-label={`${metadata.label} channel`}
                              value={eventSettings.channel}
                              onChange={(selectEvent) =>
                                edit((current) => ({
                                  ...current,
                                  events: {
                                    ...current.events,
                                    [eventId]: {
                                      ...current.events[eventId],
                                      channel: selectEvent.target
                                        .value as ReminderChannel,
                                    },
                                  },
                                }))
                              }
                              className="mt-1 h-10 w-full rounded-control border border-app-panel-border bg-background px-3 text-sm text-app-text transition-colors outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
                            >
                              <option value="none">Off</option>
                              <option value="in_app">In app</option>
                            </select>
                          </label>
                        </div>
                      )
                    }
                  )
                : null}
            </div>
          </section>

          {loadError || error ? (
            <p className="text-sm font-medium text-destructive">
              {error || "Notification settings could not be loaded."}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm font-medium text-emerald-700">{message}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="action"
              disabled={pending !== ""}
              onClick={() => void save()}
            >
              {pending === "save" ? "Saving…" : "Save notifications"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PanelHeading({ title }: { title: string }) {
  return (
    <div className="mb-7">
      <h2 className="text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
    </div>
  )
}

function AccountsPanel({
  onSocialAccountDisconnected,
}: {
  onSocialAccountDisconnected?: (integrationId: string) => void
}) {
  const {
    data,
    error: loadError,
    isLoading: loading,
    mutate,
  } = useAppQuery<{
    status?: { configured: boolean; message?: string }
    manageUrl?: string
    integrations?: unknown[]
    disconnectedIntegrations?: unknown[]
  }>("/api/publishing/accounts", clientQueryFetcher)
  const accounts = normalizedIntegrations(data?.integrations)
  const disconnectedAccounts = normalizedIntegrations(
    data?.disconnectedIntegrations
  )
  const [actionError, setActionError] = useState("")
  const [pendingId, setPendingId] = useState("")
  const [disconnectingAccount, setDisconnectingAccount] =
    useState<SocialIntegration | null>(null)
  const notConnected =
    data?.status && !data.status.configured
      ? data.status.message || "SocialBu not connected"
      : ""
  const error = loadError
    ? "Could not load accounts."
    : actionError || notConnected
  const manageUrl = data?.manageUrl || "https://socialbu.com"
  function connect() {
    window.open(manageUrl, "_blank", "noopener,noreferrer")
  }
  async function disconnect(account: SocialIntegration) {
    setPendingId(account.integration_id)
    setActionError("")
    try {
      await fetchJsonWithTimeout("/api/publishing/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: account.integration_id }),
        toastOnError: false,
      })
      onSocialAccountDisconnected?.(account.integration_id)
      await mutate()
    } catch (disconnectError) {
      const message = getApiErrorMessage(
        disconnectError,
        "Could not disconnect account."
      )
      setActionError(message)
      throw new Error(message)
    } finally {
      setPendingId("")
    }
  }
  async function restore(account: SocialIntegration) {
    setPendingId(account.integration_id)
    setActionError("")
    try {
      await fetchJsonWithTimeout("/api/publishing/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: account.integration_id }),
        toastOnError: false,
      })
      await mutate()
    } catch (restoreError) {
      setActionError(
        getApiErrorMessage(restoreError, "Could not restore account.")
      )
    } finally {
      setPendingId("")
    }
  }
  return (
    <div>
      <PanelHeading title="Connected accounts" />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={connect}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-app-action px-4 text-sm font-semibold text-white hover:bg-[#5b21b6]"
        >
          <IconPlus className="size-4" />
          Add social account
        </button>
        <a
          href={manageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#dddde5] px-4 text-sm font-semibold text-[#4f4f5b] hover:bg-[#f7f7fa]"
        >
          <IconExternalLink className="size-4" />
          Manage accounts in SocialBu
        </a>
      </div>
      {error ? (
        <p className="mb-4 text-sm font-medium text-[#b43e4d]">{error}</p>
      ) : null}
      {loading ? (
        <ListSkeleton count={4} className="border-y border-app-panel-border" />
      ) : loadError ? (
        <Button variant="outline" onClick={() => void mutate()}>
          Try loading accounts again
        </Button>
      ) : accounts.length ? (
        <div className="divide-y divide-[#ececf1] border-y border-app-panel-border">
          {accounts.map((a) => (
            <div
              key={`${a.provider}:${a.integration_id}`}
              className="flex items-center gap-3 py-4"
            >
              <span className="grid size-10 place-items-center rounded-full bg-app-strong text-white">
                {a.provider === "instagram" ? (
                  <IconBrandInstagram className="size-5" />
                ) : a.provider === "youtube" ? (
                  <IconBrandYoutube className="size-5" />
                ) : (
                  <IconBrandTiktok className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {a.name || a.profile || a.provider}
                </p>
                <p className="text-xs text-app-text-faint capitalize">
                  {a.provider}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#27845b]">
                  <IconCheck className="size-4" />
                  Connected
                </span>
                <button
                  type="button"
                  disabled={pendingId === a.integration_id}
                  onClick={() => setDisconnectingAccount(a)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#efcfd3] px-2.5 text-xs font-semibold text-[#a8464f] hover:bg-[#fff5f6] disabled:cursor-wait disabled:opacity-50"
                >
                  <IconTrash className="size-3.5" />
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={IconExternalLink}
          title="No social accounts yet"
          text="Connect Instagram, TikTok, YouTube, and other publishing destinations."
        />
      )}
      {disconnectedAccounts.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-sm font-semibold">Disconnected from LumenClip</h3>
          <div className="mt-3 divide-y divide-[#ececf1] border-y border-app-panel-border">
            {disconnectedAccounts.map((account) => (
              <div
                key={`${account.provider}:${account.integration_id}`}
                className="flex items-center gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {account.name || account.profile || account.provider}
                  </p>
                  <p className="text-xs text-app-text-faint capitalize">
                    {account.provider}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pendingId === account.integration_id}
                  onClick={() => void restore(account)}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#dddde5] px-2.5 text-xs font-semibold hover:bg-[#f7f7fa] disabled:cursor-wait disabled:opacity-50"
                >
                  <IconRefresh className="size-3.5" />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {disconnectingAccount ? (
        <ConfirmDialog
          title={`Disconnect ${disconnectingAccount.name || disconnectingAccount.profile || disconnectingAccount.provider}?`}
          description="This hides the account from the publish dialog. Its SocialBu connection is not revoked."
          confirmLabel="Disconnect account"
          pendingLabel="Disconnecting…"
          onCancel={() => setDisconnectingAccount(null)}
          onConfirm={() => disconnect(disconnectingAccount)}
        />
      ) : null}
    </div>
  )
}

function normalizedIntegrations(values: unknown[] | undefined) {
  return (values ?? []).flatMap((value) => {
    const integration = normalizeSocialBuSocialIntegration(value)
    return integration ? [integration] : []
  })
}

function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof IconExternalLink
  title: string
  text: string
}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-[#d8d8e2] bg-[#fbfbfd] p-8 text-center">
      <div>
        <Icon className="mx-auto size-6 text-app-action" />
        <p className="mt-3 text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-app-text-faint">
          {text}
        </p>
      </div>
    </div>
  )
}
