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
  IconSparkles,
  IconBell,
  IconSettings,
  IconTrash,
  IconUpload,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { InfluLabAccountCard } from "@/components/realfarm/influlab-account-card"
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

type Tab = "billing" | "accounts" | "models" | "reminders" | "team" | "demos"
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
  notificationDefaultsApplied?: boolean
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
    username?: string
    name?: string
    defaultChatConfigured: boolean
    interactiveConfigured: boolean
  }
}

type GenerationModelSettings = {
  id: "generation-models"
  slideshowTextModel: string
  imageCaptioningModel: string
  updatedAt: string
}

const tabs = [
  { id: "billing", label: "Billing & plans", icon: IconCreditCard },
  { id: "accounts", label: "Connected accounts", icon: IconExternalLink },
  { id: "models", label: "AI models", icon: IconSparkles },
  { id: "reminders", label: "Notifications", icon: IconBell },
  { id: "team", label: "Team members", icon: IconUsers },
  { id: "demos", label: "Demos", icon: IconVideo },
] as const

export function UserSettingsModal({
  onClose,
  onSocialAccountDisconnected,
}: {
  onClose: () => void
  onSocialAccountDisconnected?: (integrationId: string) => void
}) {
  const [tab, setTab] = useState<Tab>("billing")
  const [remindersDirty, setRemindersDirty] = useState(false)
  const [modelsDirty, setModelsDirty] = useState(false)
  const dirtyGuard = useDirtyGuard(remindersDirty || modelsDirty)

  function requestClose() {
    dirtyGuard.run(onClose)
  }

  function selectTab(nextTab: Tab) {
    if (nextTab === tab) return
    dirtyGuard.run(() => {
      setRemindersDirty(false)
      setModelsDirty(false)
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
              {tab === "models" && (
                <GenerationModelsPanel onDirtyChange={setModelsDirty} />
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

const recommendedOpenRouterModels = [
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-luna-pro",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.4-mini",
  "google/gemini-3.1-flash-lite",
] as const

function GenerationModelsPanel({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void
}) {
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<{
    settings: GenerationModelSettings
  }>("/api/settings/generation-models", clientSWRFetcher)
  const [draft, setDraft] = useState<GenerationModelSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const settings = draft ?? data?.settings ?? null
  const dirty = Boolean(
    draft &&
    data?.settings &&
    (draft.slideshowTextModel !== data.settings.slideshowTextModel ||
      draft.imageCaptioningModel !== data.settings.imageCaptioningModel)
  )

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  function edit(patch: Partial<GenerationModelSettings>) {
    if (!settings) return
    setDraft({ ...settings, ...patch })
    setError("")
    setMessage("")
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const payload = await fetchJsonWithTimeout<{
        settings: GenerationModelSettings
      }>("/api/settings/generation-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideshowTextModel: settings.slideshowTextModel,
          imageCaptioningModel: settings.imageCaptioningModel,
        }),
        toastOnError: false,
      })
      setDraft(payload.settings)
      await mutate(payload, false)
      setMessage("AI model settings saved.")
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "AI models could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelHeading title="AI models" />
      {loadError ? (
        <div>
          <p className="text-sm font-medium text-destructive">
            AI model settings could not be loaded.
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
        <ListSkeleton count={2} className="border-y border-app-panel-border" />
      ) : (
        <div className="space-y-6">
          <datalist id="openrouter-model-options">
            {recommendedOpenRouterModels.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <ModelSettingField
            label="Slide text generation"
            value={settings.slideshowTextModel}
            onChange={(value) => edit({ slideshowTextModel: value })}
          />
          <ModelSettingField
            label="Picture captioning"
            value={settings.imageCaptioningModel}
            onChange={(value) => edit({ imageCaptioningModel: value })}
          />
          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}
          {message ? (
            <p className="text-sm font-medium text-emerald-700">{message}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-app-panel-border pt-5">
            <Button
              variant="action"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save AI models"}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() =>
                edit({
                  slideshowTextModel: "openai/gpt-5.6-luna",
                  imageCaptioningModel: "openai/gpt-5.6-luna",
                })
              }
            >
              Use Luna defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelSettingField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block border-t border-app-panel-border pt-4 text-sm font-semibold">
      {label}
      <input
        list="openrouter-model-options"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="mt-2 h-10 w-full rounded-control border border-app-panel-border bg-background px-3 font-mono text-sm font-normal text-app-text outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
      />
    </label>
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
  const [pending, setPending] = useState<"save" | "test" | "detect" | "">("")
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

  async function detectChat() {
    setPending("detect")
    setError("")
    setMessage("")
    try {
      const detected = await fetchJsonWithTimeout<{
        chatId: string
        title?: string
      }>("/api/settings/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect-chat" }),
        toastOnError: false,
      })
      edit((current) => ({ ...current, telegramChatId: detected.chatId }))
      setMessage(
        detected.title
          ? `Found ${detected.title}. Save to keep it.`
          : "Chat detected. Save to keep it."
      )
    } catch (detectError) {
      setError(
        getApiErrorMessage(detectError, "The Telegram chat was not detected.")
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
          {/* Shown whenever a bot exists, not only once an event already routes
              to Telegram — otherwise connecting is undiscoverable, because the
              only way to reach these fields was to first pick a channel you had
              not been able to set up yet. */}
          {data?.telegram.botConfigured || usesTelegram ? (
            <section className="space-y-4 rounded-xl border border-app-panel-border bg-app-control-bg p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-app-control-hover text-app-muted-text">
                  <IconBrandTelegram className="size-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Telegram delivery</h3>
                </div>
              </div>
              {data?.telegram.botConfigured &&
              !data?.telegram.customBotConfigured ? (
                <p className="rounded-lg bg-app-control-bg px-3 py-2 text-xs leading-5 text-app-text-faint">
                  Using the workspace bot
                  {data.telegram.username ? (
                    <>
                      {" "}
                      <a
                        href={`https://t.me/${data.telegram.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-app-action underline"
                      >
                        @{data.telegram.username}
                      </a>
                    </>
                  ) : null}
                  . Open it in Telegram, send <code>/start</code>, then detect
                  your chat below — no bot token needed.
                </p>
              ) : null}
              <label className="block text-sm font-semibold">
                Telegram chat or channel ID
                <div className="mt-2 flex gap-2">
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
                    className="h-10 w-full rounded-lg border border-app-panel-border bg-background px-3 text-sm outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending !== "" || !data?.telegram.botConfigured}
                    onClick={() => void detectChat()}
                  >
                    {pending === "detect" ? "Detecting…" : "Detect"}
                  </Button>
                </div>
              </label>
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-app-text-faint">
                  Use a different bot
                </summary>
                <label className="mt-3 block text-sm font-semibold">
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
                        : "123456789:AA…"
                    }
                    className="mt-2 h-10 w-full rounded-lg border border-app-panel-border bg-background px-3 text-sm outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
                  />
                </label>
                <p className="mt-2 leading-5 text-app-text-faint">
                  Create a bot with BotFather and paste its token to override
                  the workspace bot. Saved tokens are never returned to the
                  browser.
                </p>
              </details>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Notify me when</h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="softControl"
                  size="compact"
                  disabled={!data?.telegram.botConfigured}
                  onClick={() => setAllNotifications("telegram")}
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
            {data?.telegram.botConfigured ? (
              <Button
                variant="outline"
                disabled={pending !== "" || !settings.telegramChatId}
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

function PanelHeading({ title }: { title: string }) {
  return (
    <div className="mb-7">
      <h2 className="text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
    </div>
  )
}

function BillingPanel() {
  return (
    <div>
      <PanelHeading title="Billing & plans" />
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
      <PanelHeading title="Connected accounts" />
      <InfluLabAccountCard />
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
          description="This removes the account from every LumenClip template. Its PostFast authorization is not revoked."
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
      <PanelHeading title="Team members" />
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
      <PanelHeading title="Demos" />
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
