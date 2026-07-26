"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconBrandInstagram,
  IconBrandTelegram,
  IconBrandTiktok,
  IconBrandYoutube,
  IconCheck,
  IconCreditCard,
  IconExternalLink,
  IconPlus,
  IconRefresh,
  IconBell,
  IconSettings,
  IconTrash,
  IconUpload,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { useDirtyGuard } from "@/components/ui/use-dirty-guard"
import {
  CardGridSkeleton,
  ListSkeleton,
} from "@/components/ui/loading-skeleton"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { normalizePostFastSocialIntegration } from "@/lib/social/postfast-adapter"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import { clientSWRFetcher } from "@/lib/client-swr"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { cn } from "@/lib/utils"

type Tab = "billing" | "accounts" | "reminders" | "team" | "demos"
type Member = {
  id: string
  email: string
  status: "pending" | "accepted"
  createdAt: string
}
type Demo = { id: string; title: string; url: string; createdAt: string }
type ReminderEvent =
  | "generated"
  | "ready_to_post"
  | "scheduled_to_post"
  | "respond_to_comments"
  | "publish_failed"
  | "generation_failed"
type ReminderChannel = "none" | "telegram"
type ReminderSettings = {
  telegramChatId?: string
  telegramBotToken?: string
  events: Record<
    ReminderEvent,
    { channel: ReminderChannel; offsetsHours?: number[] }
  >
}
type ReminderResponse = {
  settings: ReminderSettings
  eventMetadata: Record<
    ReminderEvent,
    {
      label: string
      description: string
      supportsOffsets: boolean
      defaultOffsetsHours?: number[]
    }
  >
  telegram: {
    botConfigured: boolean
    customBotConfigured: boolean
    defaultChatConfigured: boolean
    interactiveConfigured: boolean
  }
}

const tabs = [
  { id: "billing", label: "Billing & plans", icon: IconCreditCard },
  { id: "accounts", label: "Connected accounts", icon: IconExternalLink },
  { id: "reminders", label: "Notifications", icon: IconBell },
  { id: "team", label: "Team members", icon: IconUsers },
  { id: "demos", label: "Demos", icon: IconVideo },
] as const

export function UserSettingsModal({
  email,
  onClose,
  onSocialAccountDisconnected,
}: {
  email: string
  onClose: () => void
  onSocialAccountDisconnected?: (integrationId: string) => void
}) {
  const [tab, setTab] = useState<Tab>("billing")
  const [remindersDirty, setRemindersDirty] = useState(false)
  const dirtyGuard = useDirtyGuard(remindersDirty)

  function requestClose() {
    dirtyGuard.run(onClose)
  }

  function selectTab(nextTab: Tab) {
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
            description={email}
            closeLabel="Close settings"
            onClose={requestClose}
          />
          <div className="grid h-[calc(100vh-7rem)] max-h-[600px] min-h-0 md:grid-cols-[220px_1fr]">
            <nav className="overflow-y-auto border-b border-app-panel-border bg-[#fafafd] p-3 md:border-r md:border-b-0">
              {tabs.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => selectTab(item.id)}
                    className={cn(
                      "mb-1 flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-medium",
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
              {tab === "billing" && <BillingPanel />}
              {tab === "accounts" && (
                <AccountsPanel
                  onSocialAccountDisconnected={onSocialAccountDisconnected}
                />
              )}
              {tab === "reminders" && (
                <RemindersPanel onDirtyChange={setRemindersDirty} />
              )}
              {tab === "team" && <TeamPanel />}
              {tab === "demos" && <DemosPanel />}
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
  } = useSWR<ReminderResponse>("/api/settings/reminders", clientSWRFetcher)
  const [draft, setDraft] = useState<ReminderSettings | null>(null)
  const [pending, setPending] = useState<"save" | "test" | "">("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const settings = draft ?? data?.settings ?? null
  const usesTelegram = Boolean(
    settings &&
    Object.values(settings.events).some((event) => event.channel === "telegram")
  )
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

  async function testTelegram() {
    if (!settings) return
    setPending("test")
    setError("")
    setMessage("")
    try {
      await fetchJsonWithTimeout("/api/settings/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: settings.telegramChatId }),
        toastOnError: false,
      })
      setMessage("Test notification sent to Telegram.")
    } catch (testError) {
      setError(
        getApiErrorMessage(testError, "The Telegram test could not be sent.")
      )
    } finally {
      setPending("")
    }
  }

  return (
    <div>
      <PanelHeading
        title="Notifications"
        description="Choose where LumenClip should notify you as content moves through generation and publishing."
      />
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
          {usesTelegram ? (
            <section className="space-y-4 rounded-xl border border-app-panel-border bg-app-control-bg p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-app-control-hover text-app-muted-text">
                  <IconBrandTelegram className="size-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Telegram delivery</h3>
                  <p className="text-xs leading-5 text-app-text-faint">
                    Used by every event routed to Telegram.
                  </p>
                </div>
              </div>
              <label className="block text-sm font-semibold">
                Telegram bot token
                <input
                  type="password"
                  autoComplete="off"
                  value={settings.telegramBotToken ?? ""}
                  onChange={(event) =>
                    edit((current) => ({
                      ...current,
                      telegramBotToken: event.target.value,
                    }))
                  }
                  placeholder={
                    data?.telegram.customBotConfigured
                      ? "Saved — enter a new token to replace it"
                      : data?.telegram.botConfigured
                        ? "Using the workspace default"
                        : "123456789:AA…"
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-app-panel-border bg-background px-3 text-sm outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
                />
              </label>
              <label className="block text-sm font-semibold">
                Telegram chat or channel ID
                <input
                  value={settings.telegramChatId ?? ""}
                  onChange={(event) =>
                    edit((current) => ({
                      ...current,
                      telegramChatId: event.target.value,
                    }))
                  }
                  placeholder={
                    data?.telegram.defaultChatConfigured
                      ? "Using the workspace default"
                      : "123456789 or @channelname"
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-app-panel-border bg-background px-3 text-sm outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
                />
              </label>
              <p className="text-xs leading-5 text-app-text-faint">
                Create a bot with BotFather, start a chat with it, then enter
                the bot token and destination ID. Saved tokens are never
                returned to the browser.
              </p>
              {!data?.telegram.botConfigured ? (
                <p className="mt-3 text-xs font-medium text-destructive">
                  Telegram delivery needs a server bot token before it can be
                  enabled.
                </p>
              ) : !data?.telegram.interactiveConfigured ? (
                <p className="mt-3 text-xs font-medium text-amber-700">
                  Messages can be delivered, but the one-tap posted button needs
                  a public app URL and Telegram webhook secret.
                </p>
              ) : null}
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold">Notify me when</h3>
            <div className="mt-3 divide-y divide-app-panel-border rounded-xl border border-app-panel-border">
              {data?.eventMetadata
                ? Object.entries(data.eventMetadata).map(
                    ([event, metadata]) => {
                      const eventId = event as ReminderEvent
                      const eventSettings = settings.events[eventId]
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
                              <option value="telegram">Telegram</option>
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
            {usesTelegram ? (
              <Button
                variant="outline"
                disabled={pending !== "" || !data?.telegram.botConfigured}
                onClick={() => void testTelegram()}
              >
                {pending === "test" ? "Sending…" : "Send test"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function PanelHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="mb-7">
      <h2 className="text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-app-muted-text">
        {description}
      </p>
    </div>
  )
}

function BillingPanel() {
  return (
    <div>
      <PanelHeading
        title="Billing & plans"
        description="Manage your LumenClip subscription and usage."
      />
      <div className="rounded-[14px] border border-[#e4d7ff] bg-[#f6f2ff] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-app-action uppercase">
              Current plan
            </p>
            <h3 className="mt-1 text-xl font-semibold">LumenClip Free</h3>
          </div>
          <span className="rounded-full bg-app-surface px-3 py-1 text-xs font-semibold text-app-action">
            Active
          </span>
        </div>
        <p className="mt-4 text-sm text-app-muted-text">
          Billing is being finalized. You’ll be able to upgrade, manage payment
          methods, and download invoices here.
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {["Generations", "Storage", "Team seats"].map((label) => (
          <div key={label} className="border-t border-app-panel-border pt-4">
            <p className="text-xs font-medium text-app-text-faint">{label}</p>
            <p className="mt-1 text-sm font-semibold">Coming soon</p>
          </div>
        ))}
      </div>
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
  } = useSWR<{
    integrations?: unknown[]
    disconnectedIntegrations?: unknown[]
  }>("/api/postfast/integrations", clientSWRFetcher)
  const accounts = normalizedIntegrations(data?.integrations)
  const disconnectedAccounts = normalizedIntegrations(
    data?.disconnectedIntegrations
  )
  const [actionError, setActionError] = useState("")
  const [pendingId, setPendingId] = useState("")
  const [disconnectingAccount, setDisconnectingAccount] =
    useState<SocialIntegration | null>(null)
  const error = loadError ? "Could not load accounts." : actionError
  async function connect() {
    const r = await fetch("/api/postfast/connect-url")
    const p = await r.json().catch(() => null)
    if (r.ok && p?.url) window.open(p.url, "_blank", "noopener,noreferrer")
    else setActionError(p?.error || "Could not create a connection link.")
  }
  async function disconnect(account: SocialIntegration) {
    setPendingId(account.integration_id)
    setActionError("")
    try {
      await fetchJsonWithTimeout("/api/postfast/integrations", {
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
      await fetchJsonWithTimeout("/api/postfast/integrations", {
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
      <PanelHeading
        title="Connected accounts"
        description="Connect social profiles once, then choose them in any automation. Disconnecting here removes an account from every LumenClip automation."
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={connect}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-app-action px-4 text-sm font-semibold text-white hover:bg-[#5b21b6]"
        >
          <IconPlus className="size-4" />
          Add social account
        </button>
        <a
          href="https://app.postfa.st"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#dddde5] px-4 text-sm font-semibold text-[#4f4f5b] hover:bg-[#f7f7fa]"
        >
          <IconExternalLink className="size-4" />
          Manage authorization in PostFast
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
          <p className="mt-1 text-xs leading-5 text-app-text-faint">
            These accounts remain authorized in PostFast until you revoke them
            there.
          </p>
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
          description="This removes the account from every LumenClip automation. Its PostFast authorization is not revoked."
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
    const integration = normalizePostFastSocialIntegration(value)
    return integration ? [integration] : []
  })
}

function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([]),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("")
  async function load() {
    try {
      const r = await fetch("/api/settings/team")
      const p = await r.json().catch(() => null)
      if (r.ok) {
        setMembers(p.members || [])
        setError("")
      } else {
        setError(p?.error || "Could not load team members.")
      }
    } catch {
      setError("Could not load team members.")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError("")
    try {
      await fetchJsonWithTimeout("/api/settings/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        toastOnError: false,
      })
      setOpen(false)
      setEmail("")
      setLoading(true)
      await load()
    } catch (inviteError) {
      setError(getApiErrorMessage(inviteError, "Invitation failed."))
    } finally {
      setPending(false)
    }
  }
  return (
    <div>
      <PanelHeading
        title="Team members"
        description="Collaborators can view your generations. Your automations stay private and editable only by you."
      />
      <button
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-[10px] bg-app-action px-4 text-sm font-semibold text-white"
      >
        <IconPlus className="size-4" />
        Add member
      </button>
      {error ? (
        <p className="mb-4 text-sm font-medium text-[#b43e4d]">{error}</p>
      ) : null}
      {loading ? (
        <ListSkeleton count={4} className="border-y border-app-panel-border" />
      ) : members.length ? (
        <div className="divide-y divide-[#ececf1] border-y border-app-panel-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-4">
              <span className="grid size-9 place-items-center rounded-full bg-app-control-hover text-sm font-semibold text-app-action">
                {m.email[0]?.toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold">{m.email}</p>
                <p className="text-xs text-app-text-faint">
                  Can view shared generations
                </p>
              </div>
              <span
                className={cn(
                  "ml-auto rounded-full px-2.5 py-1 text-xs font-semibold",
                  m.status === "accepted"
                    ? "bg-[#e9f7ef] text-[#27845b]"
                    : "bg-[#fff5df] text-[#93630c]"
                )}
              >
                {m.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={IconUsers}
          title="No collaborators"
          text="Invite someone by email to share selected workspace output."
        />
      )}
      {open ? (
        <AppModal
          className="z-[120] bg-[#242136]/45"
          onClose={() => setOpen(false)}
        >
          <AppModalPanel className="max-w-[470px] p-0">
            <AppModalHeader
              title="Invite collaborator"
              description="They’ll receive an email invitation to LumenClip."
              closeLabel="Close invite"
              onClose={() => setOpen(false)}
            />
            <form onSubmit={invite} className="p-5">
              <label className="text-sm font-semibold">
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-11 w-full rounded-[10px] border border-[#d8d8e2] px-3 outline-none focus:border-[#6d28d9]"
                />
              </label>
              {error ? (
                <p className="mt-3 text-sm text-[#b43e4d]">{error}</p>
              ) : null}
              <button
                disabled={pending}
                className="mt-5 h-10 w-full rounded-[10px] bg-app-action text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send invitation"}
              </button>
            </form>
          </AppModalPanel>
        </AppModal>
      ) : null}
    </div>
  )
}

function DemosPanel() {
  const [demos, setDemos] = useState<Demo[]>([]),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState("")
  const input = useRef<HTMLInputElement>(null)
  async function load() {
    try {
      const r = await fetch("/api/settings/demos")
      const p = await r.json().catch(() => null)
      if (r.ok) {
        setDemos(p.demos || [])
        setError("")
      } else {
        setError(p?.error || "Could not load demos.")
      }
    } catch {
      setError("Could not load demos.")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  async function upload(file: File) {
    setPending(true)
    setError("")
    const form = new FormData()
    form.set("file", file)
    form.set("title", file.name.replace(/\.[^.]+$/, ""))
    try {
      await fetchJsonWithTimeout("/api/settings/demos", {
        method: "POST",
        body: form,
        toastOnError: false,
      })
      setLoading(true)
      await load()
    } catch (uploadError) {
      setError(getApiErrorMessage(uploadError, "Upload failed."))
    } finally {
      setPending(false)
    }
  }
  return (
    <div>
      <PanelHeading
        title="Demos"
        description="Upload product walkthroughs and example videos for your workspace."
      />
      <UploadDropzone
        inputRef={input}
        accept="video/*"
        disabled={pending}
        onFiles={(files) => {
          const f = files?.[0]
          if (f) void upload(f)
        }}
      >
        <Button className="mb-6" variant="action" disabled={pending}>
          <IconUpload className="size-4" />
          {pending ? "Uploading…" : "Upload demo"}
        </Button>
      </UploadDropzone>
      {error ? <p className="mb-4 text-sm text-[#b43e4d]">{error}</p> : null}
      {loading ? (
        <CardGridSkeleton count={4} className="sm:grid-cols-2 xl:grid-cols-2" />
      ) : demos.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {demos.map((d) => (
            <article
              key={d.id}
              className="overflow-hidden rounded-[14px] border border-app-panel-border bg-app-surface"
            >
              <video
                controls
                preload="metadata"
                src={d.url}
                className="aspect-video w-full bg-app-strong"
              />
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="mt-1 text-xs text-app-text-faint">
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={IconVideo}
          title="No demos uploaded"
          text="Your uploaded walkthroughs will appear here in a reusable grid."
        />
      )}
    </div>
  )
}

function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof IconSettings
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
