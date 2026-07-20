"use client"

import Image from "next/image"
import { useState } from "react"
import {
  LuArrowLeft,
  LuChartColumnIncreasing,
  LuCalendarDays,
  LuCheck,
  LuExternalLink,
  LuImagePlus,
  LuLoaderCircle,
  LuPlus,
  LuRadar,
  LuRefreshCw,
  LuSave,
  LuSend,
  LuSettings,
  LuShare2,
  LuSparkles,
  LuUserPlus,
} from "react-icons/lu"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { XThreadsBrandIcon } from "@/components/realfarm/x-threads-brand-icon"
import { PostingSchedulePanel } from "@/components/realfarm/automation-settings/schedule-settings"
import {
  SettingsFooter,
  SettingsPage,
  SettingsRow,
} from "@/components/realfarm/automation-settings/settings-layout"
import { AutomationSettingsNavButton } from "@/components/realfarm/automation-settings/settings-nav"
import {
  type XAutomationPlatform,
  type XAutomationRecord,
  type XAutomationRun,
  type XTrendCandidate,
} from "@/lib/x-automation"
import {
  normalizePostFastIntegration,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { cn } from "@/lib/utils"
import { hookStyles, voicePresets } from "@/lib/x-post-presets"

type StudioTab = "overview" | "schedule" | "social" | "settings"

type StrategyRequestError = {
  message: string
  retryable: boolean
  operationId?: string
}

export function XAutomationStudio({
  initialAutomations,
  initialRuns,
  embedded = false,
  onClose,
}: {
  initialAutomations: XAutomationRecord[]
  initialRuns: XAutomationRun[]
  embedded?: boolean
  onClose?: () => void
}) {
  const [automations, setAutomations] = useState(initialAutomations)
  const [savedAutomations, setSavedAutomations] = useState(initialAutomations)
  const [selectedId, setSelectedId] = useState(initialAutomations[0]?.id ?? "")
  const [runs, setRuns] = useState(initialRuns)
  const [topic, setTopic] = useState("")
  const [tab, setTab] = useState<StudioTab>("overview")
  const [busy, setBusy] = useState<
    | "create"
    | "save"
    | "generate"
    | "image"
    | "connect"
    | "publish"
    | "derive"
    | "discover"
    | ""
  >("")
  const [accounts, setAccounts] = useState<PostFastSocialIntegration[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsError, setAccountsError] = useState("")
  const [strategyError, setStrategyError] =
    useState<StrategyRequestError | null>(null)
  const [discoveryQuery, setDiscoveryQuery] = useState("")
  const [candidates, setCandidates] = useState<XTrendCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] =
    useState<XTrendCandidate | null>(null)
  const selected = automations.find((item) => item.id === selectedId)
  const preview = runs.find((run) => run.automationId === selectedId)
  const showNativePreview = !["schedule", "social", "settings"].includes(tab)

  async function loadAccounts() {
    setAccountsLoading(true)
    setAccountsError("")
    try {
      const payload = await request<{ integrations?: unknown[] }>(
        "/api/postfast/integrations"
      )
      setAccounts(
        (payload.integrations ?? []).flatMap((value) => {
          const integration = normalizePostFastIntegration(value)
          return integration &&
            selected &&
            isXAutomationAccount(integration, selected.platform)
            ? [integration]
            : []
        })
      )
    } catch (error) {
      setAccountsError(message(error))
    } finally {
      setAccountsLoading(false)
    }
  }

  function update(patch: Partial<XAutomationRecord>) {
    if (!selected) return
    setAutomations((items) =>
      items.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item
      )
    )
  }

  async function createAutomation(platform: XAutomationRecord["platform"]) {
    setBusy("create")
    try {
      const payload = await request<{ automation: XAutomationRecord }>(
        "/api/x-automations",
        {
          method: "POST",
          body: JSON.stringify({
            name:
              platform === "threads"
                ? "New Threads automation"
                : "New X automation",
            platform,
          }),
        }
      )
      setAutomations((items) => [payload.automation, ...items])
      setSavedAutomations((items) => [payload.automation, ...items])
      setSelectedId(payload.automation.id)
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function saveAutomation(deriveIfMissing = true) {
    if (!selected) return null
    setBusy("save")
    try {
      const payload = await request<{ automation: XAutomationRecord }>(
        "/api/x-automations",
        {
          method: "PATCH",
          body: JSON.stringify({ automation: selected }),
        }
      )
      let saved = payload.automation
      if (deriveIfMissing && !saved.brief && saved.niche.label.trim()) {
        const strategy = await request<{ automation: XAutomationRecord }>(
          `/api/x-automations/${encodeURIComponent(saved.id)}/derive-brief`,
          { method: "POST" }
        )
        saved = strategy.automation
      }
      setAutomations((items) =>
        items.map((item) => (item.id === selected.id ? saved : item))
      )
      setSavedAutomations((items) =>
        items.map((item) => (item.id === selected.id ? saved : item))
      )
      toast.success(
        `${saved.platform === "threads" ? "Threads" : "X"} automation saved`
      )
      return saved
    } catch (error) {
      toast.error(message(error))
      return null
    } finally {
      setBusy("")
    }
  }

  function cancelSettings() {
    if (selected) {
      const saved = savedAutomations.find((item) => item.id === selected.id)
      if (saved) {
        setAutomations((items) =>
          items.map((item) => (item.id === saved.id ? saved : item))
        )
      }
    }
    setTab("overview")
  }

  async function saveSettings() {
    const saved = await saveAutomation()
    if (saved) setTab("overview")
  }

  async function generate(sourceCandidate?: XTrendCandidate) {
    if (!selected) return
    if (!selected.niche.label.trim()) {
      toast.error("Add a niche first")
      return
    }
    if (!selected.brief) {
      toast.error("Generate the niche strategy first")
      return
    }
    setBusy("generate")
    try {
      const saved = await saveAutomation(false)
      if (!saved) return
      setBusy("generate")
      const payload = await request<{ run: XAutomationRun }>(
        "/api/x-automations/generate",
        {
          method: "POST",
          body: JSON.stringify({
            automationId: selected.id,
            topic: topic.trim(),
            sourceCandidate,
          }),
        }
      )
      setRuns((items) => [payload.run, ...items])
      setTab("overview")
      toast.success("Draft generated with inferred strategy and AI review")
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function discover() {
    if (!selected) return
    setBusy("discover")
    try {
      const saved = await saveAutomation(false)
      if (!saved) return
      setBusy("discover")
      const payload = await request<{ candidates: XTrendCandidate[] }>(
        "/api/x-automations/discover",
        {
          method: "POST",
          body: JSON.stringify({
            automationId: selected.id,
            query: discoveryQuery.trim(),
          }),
        }
      )
      setCandidates(payload.candidates)
      setSelectedCandidate(payload.candidates[0] ?? null)
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function deriveStrategy() {
    if (!selected?.niche.label.trim()) {
      toast.error("Add a niche first")
      return
    }
    setBusy("derive")
    setStrategyError(null)
    try {
      const saved = await saveAutomation(false)
      if (!saved) return
      setBusy("derive")
      const payload = await request<{ automation: XAutomationRecord }>(
        `/api/x-automations/${encodeURIComponent(saved.id)}/derive-brief`,
        { method: "POST" }
      )
      setAutomations((items) =>
        items.map((item) =>
          item.id === selected.id ? payload.automation : item
        )
      )
      toast.success("Content strategy generated")
    } catch (error) {
      const requestError = error instanceof ApiRequestError ? error : null
      setStrategyError({
        message: message(error),
        retryable: requestError?.payload.retryable === true,
        operationId:
          typeof requestError?.payload.operation === "object" &&
          requestError.payload.operation &&
          "id" in requestError.payload.operation
            ? String(requestError.payload.operation.id)
            : undefined,
      })
      if (requestError?.payload.automation) {
        const failedAutomation = requestError.payload
          .automation as XAutomationRecord
        setAutomations((items) =>
          items.map((item) =>
            item.id === failedAutomation.id ? failedAutomation : item
          )
        )
      }
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function generateImage() {
    if (!selected || !preview) return
    setBusy("image")
    try {
      const payload = await request<{ run: XAutomationRun }>(
        "/api/x-automations/image",
        {
          method: "POST",
          body: JSON.stringify({
            runId: preview.id,
            aspectRatio: selected.media.aspectRatio,
          }),
        }
      )
      setRuns((items) =>
        items.map((item) => (item.id === payload.run.id ? payload.run : item))
      )
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function connectAccount() {
    setBusy("connect")
    try {
      const payload = await request<{ url: string }>(
        "/api/postfast/connect-url?expiryDays=7"
      )
      window.open(payload.url, "_blank", "noopener,noreferrer")
      toast.success("Connect X or Threads, then refresh the account list")
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function publishNow() {
    if (!preview) return
    setBusy("publish")
    try {
      await saveAutomation()
      setBusy("publish")
      const payload = await request<{ run: XAutomationRun }>(
        "/api/x-automations/publish",
        {
          method: "POST",
          body: JSON.stringify({ runId: preview.id }),
        }
      )
      setRuns((items) =>
        items.map((item) => (item.id === payload.run.id ? payload.run : item))
      )
      if (payload.run.publishing?.skippedReason) {
        toast.error(payload.run.publishing.skippedReason)
      } else {
        toast.success(
          `Published to ${payload.run.publishing?.published ?? 0} account(s)`
        )
      }
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  return (
    <main
      className={cn(
        "bg-app-surface-subtle text-app-text",
        embedded ? "min-h-full" : "min-h-svh"
      )}
    >
      {!embedded ? (
        <header className="flex h-16 items-center justify-between border-b border-app-panel-border bg-app-surface px-5">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => window.location.assign("/app")}
            >
              <LuArrowLeft />
            </Button>
            <div>
              <div className="text-[11px] font-bold tracking-[0.14em] text-app-text-faint uppercase">
                Separate content engine
              </div>
              <h1 className="text-lg font-semibold">
                X and Threads Automations
              </h1>
            </div>
          </div>
        </header>
      ) : null}

      <div
        className={cn(
          "grid",
          showNativePreview
            ? "grid-cols-[246px_minmax(460px,1fr)_minmax(360px,0.82fr)]"
            : "grid-cols-[246px_minmax(0,1fr)]",
          embedded ? "min-h-[calc(100svh-2rem)]" : "min-h-[calc(100svh-4rem)]"
        )}
      >
        <aside className="flex min-h-0 flex-col border-r border-app-panel-border bg-app-surface-subtle p-2">
          <Button
            variant="action"
            className="mb-3 w-full"
            onClick={() => generate()}
            disabled={!selected || busy === "generate"}
          >
            {busy === "generate" ? (
              <LuLoaderCircle className="animate-spin" />
            ) : (
              <LuSparkles />
            )}
            {busy === "generate" ? "Generating…" : "Generate draft"}
          </Button>
          <div className="space-y-1">
            <AutomationSettingsNavButton
              label="Overview"
              icon={LuSparkles}
              active={tab === "overview"}
              onClick={() => setTab("overview")}
            />
            <div className="my-2 h-px bg-[#e1e0d8]" />
            <AutomationSettingsNavButton
              label="Schedule"
              icon={LuCalendarDays}
              active={tab === "schedule"}
              onClick={() => setTab("schedule")}
            />
            <AutomationSettingsNavButton
              label="Social Media Settings"
              icon={LuShare2}
              active={tab === "social"}
              onClick={() => {
                setTab("social")
                void loadAccounts()
              }}
            />
            <AutomationSettingsNavButton
              label="Settings"
              icon={LuSettings}
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          </div>
          {selected && (
            <div className="mt-auto rounded-lg border border-app-panel-border bg-app-surface p-3">
              <div className="text-[10px] font-bold tracking-[0.12em] text-app-text-faint uppercase">
                {selected.platform === "threads" ? "Threads" : "X"} automation
              </div>
              <div className="mt-1 text-sm font-bold">
                {selected.niche.label || "Set a niche"}
              </div>
              <div className="mt-1 text-xs text-app-muted-text">
                Platform-specific presets, voice, validation, and publishing.
              </div>
            </div>
          )}
        </aside>

        <section className="border-r border-app-panel-border bg-app-surface p-5">
          {embedded && onClose ? (
            <div className="mb-5 flex items-center justify-between border-b border-app-panel-border pb-4">
              <div>
                <div className="text-[10px] font-bold tracking-[0.14em] text-app-text-faint uppercase">
                  Automation
                </div>
                <div className="text-[15px] font-semibold">
                  {selected?.platform === "threads" ? "Threads" : "X"} Content
                  Engine
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <LuArrowLeft /> Back
              </Button>
            </div>
          ) : null}
          {!selected ? (
            <EmptyState onCreate={createAutomation} />
          ) : (
            <>
              <div className="mb-5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold tracking-[0.12em] text-app-text-faint uppercase">
                    {selected.platform === "threads" ? "Threads" : "X"}
                  </div>
                  <h2 className="text-2xl font-semibold">Content Engine</h2>
                </div>
                <button
                  onClick={() =>
                    update({
                      status: selected.status === "live" ? "paused" : "live",
                    })
                  }
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    selected.status === "live"
                      ? "bg-[#dff8e8] text-[#187843]"
                      : "bg-[#e9e8e2] text-app-muted-text"
                  )}
                >
                  {selected.status === "live" ? "Live" : "Paused"}
                </button>
                <Button
                  variant="softControl"
                  onClick={() => void saveAutomation()}
                  disabled={busy === "save"}
                >
                  <LuSave />
                  Save
                </Button>
              </div>
              {tab === "overview" && (
                <>
                  <ComposePanel
                    automation={selected}
                    topic={topic}
                    setTopic={setTopic}
                    update={update}
                    onDerive={deriveStrategy}
                    deriving={busy === "derive"}
                    strategyError={strategyError}
                  />
                  <DiscoveryPanel
                    automation={selected}
                    update={update}
                    query={discoveryQuery}
                    setQuery={setDiscoveryQuery}
                    candidates={candidates}
                    selectedCandidate={selectedCandidate}
                    onSelect={setSelectedCandidate}
                    onDiscover={discover}
                    onGenerate={(candidate) => void generate(candidate)}
                    busy={busy}
                  />
                </>
              )}
              {tab === "schedule" && (
                <PostingSchedulePanel
                  schedule={selected.schedule}
                  onScheduleChange={(schedule) => update({ schedule })}
                  onCancel={cancelSettings}
                  onSave={() => void saveSettings()}
                />
              )}
              {tab === "social" && (
                <AccountSettingsPanel
                  automation={selected}
                  update={update}
                  accounts={accounts}
                  loading={accountsLoading}
                  error={accountsError}
                  onRefresh={loadAccounts}
                  onConnect={connectAccount}
                  busy={busy}
                  onCancel={cancelSettings}
                  onSave={() => void saveSettings()}
                />
              )}
              {tab === "settings" && (
                <XGeneralSettingsPanel
                  automation={selected}
                  update={update}
                  onCancel={cancelSettings}
                  onSave={() => void saveSettings()}
                />
              )}
            </>
          )}
        </section>

        {showNativePreview ? (
          <aside className="bg-app-surface-subtle p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold tracking-[0.12em] text-app-text-faint uppercase">
                  Native preview
                </div>
                <h2 className="text-lg font-semibold">
                  {(preview?.platform ?? selected?.platform) === "threads"
                    ? "Threads"
                    : "X"}
                </h2>
              </div>
              <div className="flex gap-2">
                {preview && selected?.media.mode === "generate" && (
                  <Button
                    variant="softControl"
                    size="sm"
                    onClick={generateImage}
                    disabled={busy === "image"}
                  >
                    {busy === "image" ? (
                      <LuLoaderCircle className="animate-spin" />
                    ) : (
                      <LuImagePlus />
                    )}
                    Picture
                  </Button>
                )}
                {preview &&
                  (selected?.publishing.integrations.length ?? 0) > 0 && (
                    <Button
                      variant="action"
                      size="sm"
                      onClick={publishNow}
                      disabled={busy === "publish"}
                    >
                      {busy === "publish" ? (
                        <LuLoaderCircle className="animate-spin" />
                      ) : (
                        <LuSend />
                      )}
                      Publish
                    </Button>
                  )}
              </div>
            </div>
            <XPreview run={preview} platform={selected?.platform} />
            {preview && <BenchmarkCard run={preview} />}
          </aside>
        ) : null}
      </div>
    </main>
  )
}

function ComposePanel({
  automation,
  topic,
  setTopic,
  update,
  onDerive,
  deriving,
  strategyError,
}: {
  automation: XAutomationRecord
  topic: string
  setTopic: (value: string) => void
  update: (patch: Partial<XAutomationRecord>) => void
  onDerive: () => void
  deriving: boolean
  strategyError: StrategyRequestError | null
}) {
  const availableHookStyles = hookStyles.filter(
    (style) =>
      style.platform === "both" || style.platform === automation.platform
  )
  return (
    <div className="space-y-4">
      <Panel
        title="Content strategy"
        description="Add one niche. The audience, promise, and weighted pillars are derived once and reused."
      >
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Field label="Niche">
              <input
                value={automation.niche.label}
                onChange={(event) =>
                  update({
                    niche: { ...automation.niche, label: event.target.value },
                    brief: null,
                  })
                }
                placeholder="e.g. personal finance for gen z"
              />
            </Field>
          </div>
          <Button
            variant="softControl"
            onClick={onDerive}
            disabled={deriving || !automation.niche.label.trim()}
          >
            {deriving ? <LuLoaderCircle className="animate-spin" /> : <LuRefreshCw />}
            {automation.brief ? "Regenerate strategy" : "Generate strategy"}
          </Button>
        </div>
        {strategyError ? (
          <div className="mt-3 rounded-xl border border-[#f0d3cc] bg-[#fff7f5] p-3 text-xs text-[#9b3f2f]">
            <div className="font-semibold">{strategyError.message}</div>
            {strategyError.retryable ? (
              <Button
                variant="softControl"
                size="compact"
                className="mt-2"
                onClick={onDerive}
                disabled={deriving}
              >
                <LuRefreshCw className="size-3.5" /> Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {automation.brief ? (
          <div className="mt-3 rounded-xl border border-app-panel-border bg-app-surface-subtle p-4 text-sm">
            <div>
              <span className="font-bold">Audience:</span>{" "}
              {automation.brief.audience}
            </div>
            <div className="mt-1">
              <span className="font-bold">Promise:</span>{" "}
              {automation.brief.promise}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {automation.brief.pillars.map((pillar, index) => (
                <input
                  key={`${index}-${pillar.weight}`}
                  className="h-8 min-w-36 rounded-full border border-app-panel-border bg-app-surface px-3 text-xs font-bold"
                  value={pillar.label}
                  aria-label={`Pillar ${index + 1}`}
                  onChange={(event) =>
                    update({
                      brief: automation.brief
                        ? {
                            ...automation.brief,
                            pillars: automation.brief.pillars.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, label: event.target.value }
                                  : item
                            ),
                          }
                        : null,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-app-muted-text">
            Generate the strategy before creating a draft.
          </p>
        )}
      </Panel>

      <Panel
        title="Draft controls"
        description="Topic is optional. About 20% of planned drafts use it instead of a recurring pillar."
      >
        <Field label="Topic">
          <textarea
            rows={2}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Why exact birth time changes a natal chart"
          />
        </Field>
        <div className="mt-3 inline-flex rounded-full border border-app-panel-border bg-app-surface-subtle px-3 py-1.5 text-xs font-bold">
          {automation.platform === "threads" ? "Threads" : "X"} · fixed for this
          automation
        </div>
      </Panel>

      <Panel
        title="Hooks and voice"
        description="The generator samples from enabled platform-compatible formulas and avoids immediate repeats."
      >
        <div className="flex flex-wrap gap-2">
          {availableHookStyles.map((style) => {
            const active = automation.generation.hookStyles.includes(style.id)
            const disabled = Boolean(
              style.needsProof && automation.proofBank.length === 0
            )
            return (
              <button
                key={style.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  update({
                    generation: {
                      ...automation.generation,
                      hookStyles: active
                        ? automation.generation.hookStyles.filter(
                            (id) => id !== style.id
                          )
                        : [...automation.generation.hookStyles, style.id],
                    },
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-35",
                  active
                    ? "border-app-strong bg-app-strong text-white"
                    : "border-app-panel-border bg-app-surface"
                )}
              >
                {style.label}
              </button>
            )
          })}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Voice preset"
            value={automation.generation.voicePreset}
            options={voicePresets.map((item) => item.id)}
            onChange={(voicePreset) =>
              update({ generation: { ...automation.generation, voicePreset } })
            }
          />
        </div>
      </Panel>
    </div>
  )
}

function DiscoveryPanel({
  automation,
  update,
  query,
  setQuery,
  candidates,
  selectedCandidate,
  onSelect,
  onDiscover,
  onGenerate,
  busy,
}: {
  automation: XAutomationRecord
  update: (patch: Partial<XAutomationRecord>) => void
  query: string
  setQuery: (value: string) => void
  candidates: XTrendCandidate[]
  selectedCandidate: XTrendCandidate | null
  onSelect: (value: XTrendCandidate) => void
  onDiscover: () => void
  onGenerate: (candidate: XTrendCandidate) => void
  busy: string
}) {
  return (
    <div className="space-y-4">
      <Panel
        title="Trend radar"
        description="Search public X, TikTok, and Instagram content through Apify, then rank it by niche relevance and engagement."
      >
        <div className="grid grid-cols-[1fr_180px] gap-2">
          <input
            className="min-w-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search query (defaults to niche keywords)"
          />
          <SelectField
            label="Reaction"
            value={automation.discovery.reactionMode}
            options={["quote", "repost"]}
            onChange={(value) =>
              update({
                discovery: {
                  ...automation.discovery,
                  reactionMode: value as "quote" | "repost",
                },
              })
            }
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="Lookback hours">
            <input
              type="number"
              min={1}
              value={automation.discovery.lookbackHours}
              onChange={(event) =>
                update({
                  discovery: {
                    ...automation.discovery,
                    lookbackHours: Math.max(1, Number(event.target.value) || 1),
                  },
                })
              }
            />
          </Field>
          <Field label="Minimum views">
            <input
              type="number"
              min={0}
              value={automation.discovery.minimumViews}
              onChange={(event) =>
                update({
                  discovery: {
                    ...automation.discovery,
                    minimumViews: Math.max(0, Number(event.target.value) || 0),
                  },
                })
              }
            />
          </Field>
          <Field label="Minimum engagement">
            <input
              type="number"
              min={0}
              max={1}
              step={0.001}
              value={automation.discovery.minimumEngagementRate}
              onChange={(event) =>
                update({
                  discovery: {
                    ...automation.discovery,
                    minimumEngagementRate: Math.max(
                      0,
                      Number(event.target.value) || 0
                    ),
                  },
                })
              }
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            variant="action"
            onClick={onDiscover}
            disabled={busy === "discover"}
          >
            {busy === "discover" ? (
              <LuLoaderCircle className="animate-spin" />
            ) : (
              <LuRadar />
            )}
            Search
          </Button>
        </div>
      </Panel>
      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          onClick={() => onSelect(candidate)}
          className={cn(
            "w-full rounded-xl border bg-app-surface p-4 text-left",
            selectedCandidate?.id === candidate.id
              ? "border-app-strong ring-2 ring-[#171714]/10"
              : "border-app-panel-border"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-app-surface-subtle px-2 py-1 text-[11px] font-bold uppercase">
              {candidate.source}
            </span>
            <span className="text-xs font-bold">
              {candidate.relevanceScore}/100
            </span>
          </div>
          <p className="line-clamp-4 text-sm leading-6">{candidate.text}</p>
          <div className="mt-2 text-xs text-app-muted-text">{candidate.reason}</div>
          {selectedCandidate?.id === candidate.id && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="action"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation()
                  onGenerate(candidate)
                }}
              >
                {automation.discovery.reactionMode === "repost"
                  ? "Prepare repost"
                  : "Generate quote reaction"}
              </Button>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function AccountSettingsPanel({
  automation,
  update,
  accounts,
  loading,
  error,
  onRefresh,
  onConnect,
  busy,
  onCancel,
  onSave,
}: {
  automation: XAutomationRecord
  update: (patch: Partial<XAutomationRecord>) => void
  accounts: PostFastSocialIntegration[]
  loading: boolean
  error: string
  onRefresh: () => void
  onConnect: () => void
  busy: string
  onCancel: () => void
  onSave: () => void
}) {
  const selectedKeys = new Set(
    automation.publishing.integrations.map(accountKey)
  )

  function toggleAccount(account: PostFastSocialIntegration) {
    const selected = selectedKeys.has(accountKey(account))
    update({
      publishing: {
        ...automation.publishing,
        integrations: selected
          ? automation.publishing.integrations.filter(
              (item) => accountKey(item) !== accountKey(account)
            )
          : [...automation.publishing.integrations, account],
      },
    })
  }

  return (
    <SettingsPage title="Social Media Settings">
      <div className="space-y-4">
        <Panel
          title={`${automation.platform === "threads" ? "Threads" : "X"} accounts`}
          description={`Only ${automation.platform === "threads" ? "Threads" : "X"} accounts can be selected for this automation.`}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="action"
              size="sm"
              onClick={onConnect}
              disabled={busy === "connect"}
            >
              {busy === "connect" ? (
                <LuLoaderCircle className="animate-spin" />
              ) : (
                <LuUserPlus />
              )}
              Add or change account
            </Button>
            <Button
              type="button"
              variant="softControl"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
            >
              <LuRefreshCw className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          {error && (
            <div className="rounded-lg border border-[#efcaca] bg-[#fff7f7] px-3 py-2 text-xs font-semibold text-[#9d3434]">
              {error}
            </div>
          )}
          {loading ? (
            <CardGridSkeleton
              count={4}
              className="grid-cols-2 xl:grid-cols-2"
            />
          ) : accounts.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((account) => {
                const selected = selectedKeys.has(accountKey(account))
                return (
                  <button
                    key={accountKey(account)}
                    type="button"
                    onClick={() => toggleAccount(account)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-app-surface p-3 text-left",
                      selected
                        ? "border-app-strong ring-2 ring-[#171714]/10"
                        : "border-app-panel-border"
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-app-strong text-xs font-bold text-white">
                      <XThreadsBrandIcon
                        platform={
                          account.provider === "threads" ? "threads" : "x"
                        }
                        className="size-5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {account.profile || account.name}
                      </span>
                      <span className="block text-xs text-app-muted-text">
                        {account.provider === "threads" ? "Threads" : "X"}
                      </span>
                    </span>
                    {selected && <LuCheck className="size-4" />}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-app-panel-border px-6 text-center text-sm text-app-muted-text">
              No connected {automation.platform === "threads" ? "Threads" : "X"}{" "}
              accounts found.
            </div>
          )}
        </Panel>

        <Panel
          title="Auto-publish"
          description="Scheduled automation runs publish automatically. Clicking Generate always creates an unpublished draft."
        >
          <label className="flex items-start gap-3 rounded-xl border border-app-panel-border p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={automation.publishing.autoPost}
              onChange={(event) =>
                update({
                  publishing: {
                    ...automation.publishing,
                    autoPost: event.target.checked,
                  },
                })
              }
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-bold">
                <LuSettings className="size-4" /> Auto-publish scheduled posts
              </span>
              <span className="mt-1 block text-xs leading-5 text-app-muted-text">
                Single posts can autopost now. Threads and X Articles remain
                drafts because the connected provider does not expose a safe
                reply-chain or Article publishing contract.
              </span>
            </span>
          </label>
          {automation.publishing.autoPost &&
            automation.publishing.integrations.length === 0 && (
              <div className="text-xs font-semibold text-[#9d5f13]">
                Select at least one account before enabling this automation.
              </div>
            )}
        </Panel>
      </div>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function XGeneralSettingsPanel({
  automation,
  update,
  onCancel,
  onSave,
}: {
  automation: XAutomationRecord
  update: (patch: Partial<XAutomationRecord>) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <SettingsPage title="Settings">
      <SettingsRow
        title="Language"
        description="Language used for generated posts and articles"
        control={
          <input
            className="h-10 w-44 rounded-lg border border-app-panel-border px-3 text-sm"
            value={automation.generation.language}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  language: event.target.value,
                },
              })
            }
          />
        }
      />
      {automation.platform === "x" && automation.publishing.autoPost ? (
        <div className="rounded-lg border border-[#ead8b4] bg-[#fff9ed] px-4 py-3 text-sm font-medium text-[#765a23]">
          Multi-post X threads remain drafts because reply-chain publishing is
          not available. Auto-post generation uses single-post presets only.
        </div>
      ) : null}
      <details className="rounded-xl border border-app-panel-border bg-app-surface p-4">
        <summary className="cursor-pointer text-sm font-bold">Advanced</summary>
        <div className="mt-4 space-y-4">
          <Field label="Generation model">
            <input
              value={automation.generation.model}
              onChange={(event) =>
                update({
                  generation: {
                    ...automation.generation,
                    model: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Voice override">
            <textarea
              rows={3}
              value={automation.generation.voiceOverride}
              onChange={(event) =>
                update({
                  generation: {
                    ...automation.generation,
                    voiceOverride: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Proof bank">
            <textarea
              rows={4}
              value={automation.proofBank.map((item) => item.text).join("\n")}
              onChange={(event) =>
                update({ proofBank: proofEntries(event.target.value) })
              }
            />
          </Field>
          <Field label="Excluded topics">
            <input
              value={automation.excludedTopics.join(", ")}
              onChange={(event) =>
                update({ excludedTopics: csv(event.target.value) })
              }
            />
          </Field>
          <SelectField
            label="Picture"
            value={automation.media.mode}
            options={["none", "generate"]}
            onChange={(value) =>
              update({
                media: {
                  ...automation.media,
                  mode: value as "none" | "generate",
                },
              })
            }
          />
          {automation.media.mode === "generate" ? (
            <>
              <SelectField
                label="Picture aspect ratio"
                value={automation.media.aspectRatio}
                options={["1:1", "4:5", "16:9"]}
                onChange={(aspectRatio) =>
                  update({
                    media: {
                      ...automation.media,
                      aspectRatio:
                        aspectRatio as XAutomationRecord["media"]["aspectRatio"],
                    },
                  })
                }
              />
              <Field label="Picture direction">
                <textarea
                  rows={2}
                  value={automation.media.prompt}
                  onChange={(event) =>
                    update({
                      media: {
                        ...automation.media,
                        prompt: event.target.value,
                      },
                    })
                  }
                />
              </Field>
            </>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Trend lookback hours">
              <input
                type="number"
                value={automation.discovery.lookbackHours}
                onChange={(event) =>
                  update({
                    discovery: {
                      ...automation.discovery,
                      lookbackHours: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Minimum views">
              <input
                type="number"
                value={automation.discovery.minimumViews}
                onChange={(event) =>
                  update({
                    discovery: {
                      ...automation.discovery,
                      minimumViews: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <SelectField
              label="Reaction mode"
              value={automation.discovery.reactionMode}
              options={["none", "repost", "quote"]}
              onChange={(reactionMode) =>
                update({
                  discovery: {
                    ...automation.discovery,
                    reactionMode:
                      reactionMode as XAutomationRecord["discovery"]["reactionMode"],
                  },
                })
              }
            />
          </div>
        </div>
      </details>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function XPreview({
  run,
  platform,
}: {
  run?: XAutomationRun
  platform?: XAutomationPlatform
}) {
  if (!run)
    return (
      <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#cfcec6] bg-app-surface p-8 text-center text-sm text-app-text-faint">
        Generate a draft to see the {platform === "threads" ? "Threads" : "X"}
        -native preview.
      </div>
    )
  return (
    <div className="overflow-hidden rounded-2xl border border-app-panel-border bg-app-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-app-panel-border px-5 py-3 text-xs">
        <span className="font-semibold text-app-muted-text">
          {run.contentType === "thread"
            ? `${run.posts.length}-post thread`
            : run.contentType}
        </span>
        <a
          href={xIntentUrl(run)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-bold text-app-text hover:underline"
        >
          Open in {run.platform === "threads" ? "Threads" : "X"}{" "}
          <LuExternalLink className="size-3" />
        </a>
      </div>
      {run.plans?.length ? (
        <div className="flex flex-wrap gap-2 border-b border-app-panel-border bg-app-surface-subtle px-5 py-3">
          {run.plans.map((plan) => (
            <span
              key={`${plan.platform}-${plan.archetype}`}
              className="rounded-full border border-app-panel-border bg-app-surface px-2.5 py-1 text-[10px] font-bold"
            >
              {plan.platform.toUpperCase()} ·{" "}
              {plan.archetype.replaceAll("_", " ")} · {plan.pillar} ·{" "}
              {plan.hookStyle.replaceAll("_", " ")}
              {plan.needsReview ? " · review" : ""}
            </span>
          ))}
        </div>
      ) : null}
      {run.posts.map((post, index) => (
        <article
          key={post.id}
          className={cn("p-5", index > 0 && "border-t border-app-panel-border")}
        >
          <div className="flex gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-app-strong text-sm font-bold text-white">
              A
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-bold">Automation</span>{" "}
                <span className="text-app-muted-text">
                  @operator · now · {post.platform ?? "x"}
                </span>
              </div>
              <p className="mt-1 text-[15px] leading-[1.45] whitespace-pre-wrap">
                {post.text}
              </p>
              {index === 0 && run.sourceCandidate && (
                <a
                  href={run.sourceCandidate.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-xl border border-app-panel-border p-3 text-xs text-app-text-soft"
                >
                  Quoting {run.sourceCandidate.source}:{" "}
                  {run.sourceCandidate.text.slice(0, 160)}…
                </a>
              )}
              {index === 0 && run.imageUrls[0] && (
                <Image
                  src={run.imageUrls[0]}
                  alt="Generated post visual"
                  width={1200}
                  height={675}
                  unoptimized={run.imageUrls[0].startsWith(
                    "/api/local-assets/"
                  )}
                  className="mt-3 aspect-video w-full rounded-xl object-cover"
                />
              )}
              <div className="mt-3 flex justify-between text-xs text-app-muted-text">
                <span>♡</span>
                <span>↻</span>
                <span>♡</span>
                <span>
                  {post.characterCount}/
                  {run.contentType === "article" ? "teaser" : "limit"}
                </span>
              </div>
            </div>
          </div>
        </article>
      ))}
      {run.articleBody && (
        <div className="border-t border-app-panel-border p-5">
          <div className="text-xs font-bold text-app-text-faint uppercase">
            Article preview
          </div>
          <h3 className="mt-2 text-xl font-bold">{run.articleTitle}</h3>
          <p className="mt-3 max-h-72 overflow-auto text-sm leading-6 whitespace-pre-wrap">
            {run.articleBody}
          </p>
        </div>
      )}
    </div>
  )
}

function BenchmarkCard({ run }: { run: XAutomationRun }) {
  const metrics: Array<[keyof XAutomationRun["benchmark"], string]> = [
    ["hook", "hook"],
    ["specificity", "specificity"],
    ["readability", "readability"],
    ["cta", "cta"],
    ["formatFit", "format"],
    ["stageCompleteness", "stages"],
    ["archetypeFit", "archetype"],
    ...(typeof run.benchmark.nativeVoice === "number"
      ? ([
          ["nativeVoice", "native"],
          ["factualAccuracy", "factual"],
          ["benchmarkFit", "benchmark"],
        ] as Array<[keyof XAutomationRun["benchmark"], string]>)
      : []),
  ]
  return (
    <div className="mt-4 rounded-xl border border-app-panel-border bg-app-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <LuChartColumnIncreasing className="size-4" />
          {run.benchmark.evaluator === "ai"
            ? "AI benchmark review"
            : "Objective benchmark checks"}
        </div>
        <div className="flex items-center gap-2">
          {run.benchmark.verdict && (
            <span className="rounded-full bg-[#ecebe5] px-2 py-1 text-[10px] font-bold uppercase">
              {run.benchmark.verdict}
            </span>
          )}
          <div className="text-xl font-bold">{run.benchmark.total}</div>
        </div>
      </div>
      {run.reviewErrors?.length ? (
        <div className="mt-3 rounded-lg border border-[#f0d3cc] bg-[#fff7f5] px-3 py-2 text-xs font-medium text-[#9b3f2f]">
          {run.reviewErrors.join(" · ")}
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-5 gap-2 text-center text-[9px] text-app-muted-text">
        {metrics.map(([key, label]) => (
          <div key={key}>
            <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-[#e9e8e2]">
              <div
                className="h-full bg-app-strong"
                style={{
                  width: `${typeof run.benchmark[key] === "number" ? run.benchmark[key] : 0}%`,
                }}
              />
            </div>
            {label}
          </div>
        ))}
      </div>
      {run.benchmark.summary && (
        <p className="mt-3 text-xs leading-5 font-semibold text-[#3f3e39]">
          {run.benchmark.summary}
        </p>
      )}
      {run.benchmark.revision?.applied && (
        <div className="mt-3 rounded-lg border border-[#cfe3d3] bg-[#f3faf4] px-3 py-2 text-xs font-bold text-[#35633d]">
          {run.benchmark.revision.passes ?? 1} AI revision
          {(run.benchmark.revision.passes ?? 1) === 1 ? "" : "s"} improved the
          draft from {run.benchmark.revision.previousTotal}→
          {run.benchmark.total}
        </div>
      )}
      <div className="mt-3 rounded-lg bg-app-surface-subtle px-3 py-2 text-xs leading-5 text-app-muted-text">
        <span className="font-bold">Target:</span>{" "}
        {run.benchmark.comparison.target}
        {run.benchmark.comparison.matchedBenchmarkLabel && (
          <>
            {" "}
            · closest pattern: {run.benchmark.comparison.matchedBenchmarkLabel}
          </>
        )}
      </div>
      {run.benchmark.factualRisks && run.benchmark.factualRisks.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#efcaca] bg-[#fff7f7] px-3 py-2 text-xs text-[#8c3838]">
          <div className="font-bold">Factual risks</div>
          <ul className="mt-1 space-y-1">
            {run.benchmark.factualRisks.map((risk) => (
              <li key={risk}>• {risk}</li>
            ))}
          </ul>
        </div>
      )}
      {run.publishing && (
        <div className="mt-3 text-xs font-semibold text-app-muted-text">
          {run.publishing.skippedReason
            ? run.publishing.skippedReason
            : `${run.publishing.published} published · ${run.publishing.failed} failed`}
        </div>
      )}
      {run.benchmark.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-app-muted-text">
          {run.benchmark.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-app-panel-border bg-app-surface p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 mb-4 text-xs leading-5 text-app-muted-text">
        {description}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block text-xs font-bold text-app-muted-text">
      {label}
      <div className="mt-1 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-app-panel-border [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-app-panel-border [&_textarea]:p-3 [&_textarea]:text-sm">
        {children}
      </div>
    </label>
  )
}
function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  optionLabels?: Record<string, string>
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-bold text-app-muted-text">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-lg border border-app-panel-border bg-app-surface px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  )
}
function EmptyState({
  onCreate,
}: {
  onCreate: (platform: XAutomationRecord["platform"]) => void
}) {
  return (
    <div className="grid min-h-[70svh] place-items-center text-center">
      <div>
        <h2 className="text-xl font-semibold">
          Create your social content engine
        </h2>
        <p className="mt-2 text-sm text-app-muted-text">
          Niche + content type → generated post.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Button variant="action" onClick={() => onCreate("x")}>
            <LuPlus /> New X automation
          </Button>
          <Button variant="softControl" onClick={() => onCreate("threads")}>
            <LuPlus /> New Threads automation
          </Button>
        </div>
      </div>
    </div>
  )
}
function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}
function proofEntries(value: string): XAutomationRecord["proofBank"] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [kindPrefix, rest] = line.split(/:\s+/, 2)
      const kind =
        kindPrefix === "stat" || kindPrefix === "testimonial"
          ? kindPrefix
          : "result"
      const body =
        rest && kindPrefix !== "result"
          ? rest
          : line.replace(/^result:\s*/i, "")
      const [text, source] = body.split(/\s+\|\s+/, 2)
      return { id: `proof-${index}-${text.slice(0, 20)}`, text, kind, source }
    })
}
function accountKey(account: PostFastSocialIntegration) {
  return `${account.provider}:${account.integration_id}`
}
function isXAutomationAccount(
  account: PostFastSocialIntegration,
  platform: XAutomationRecord["platform"]
) {
  return platform === "threads"
    ? account.provider === "threads"
    : account.provider === "x" || account.provider === "twitter"
}
async function request<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new ApiRequestError(
      payload.error || `Request failed (${response.status})`,
      payload
    )
  return payload as T
}
class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly payload: Record<string, unknown>
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

function xIntentUrl(run: XAutomationRun) {
  if (run.platform === "threads") return "https://www.threads.net/"
  const sourceId = run.sourceCandidate?.url.match(/\/status\/(\d+)/)?.[1]
  if (run.reactionMode === "repost" && sourceId) {
    return `https://x.com/intent/retweet?tweet_id=${encodeURIComponent(sourceId)}`
  }
  const text = [run.posts[0]?.text, run.sourceCandidate?.url]
    .filter(Boolean)
    .join("\n\n")
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`
}
