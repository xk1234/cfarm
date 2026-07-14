"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ExternalLink,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
  Radar,
  RefreshCw,
  Save,
  Send,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { PostingSchedulePanel } from "@/components/realfarm/automation-settings/schedule-settings"
import { SettingsFooter, SettingsPage, SettingsRow } from "@/components/realfarm/automation-settings/settings-layout"
import { AutomationSettingsNavButton } from "@/components/realfarm/automation-settings/settings-nav"
import {
  characterLimitFor,
  xPostArchetypes,
  type XAutomationRecord,
  type XAutomationRun,
  type XContentType,
  type XPostLength,
  type XPostArchetype,
  type XTrendCandidate,
} from "@/lib/x-automation"
import {
  normalizePostFastIntegration,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

type StudioTab = "overview" | "format" | "hooks" | "discover" | "benchmarks" | "schedule" | "social" | "settings"

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
  const [selectedId, setSelectedId] = useState(initialAutomations[0]?.id ?? "")
  const [runs, setRuns] = useState(initialRuns)
  const [topic, setTopic] = useState("")
  const [tab, setTab] = useState<StudioTab>("overview")
  const [busy, setBusy] = useState<
    | "create"
    | "save"
    | "generate"
    | "discover"
    | "image"
    | "connect"
    | "publish"
    | ""
  >("")
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<XTrendCandidate[]>([])
  const [accounts, setAccounts] = useState<PostFastSocialIntegration[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsError, setAccountsError] = useState("")
  const [selectedCandidate, setSelectedCandidate] =
    useState<XTrendCandidate | null>(null)
  const selected = automations.find((item) => item.id === selectedId)
  const preview = runs[0]
  const showNativePreview = !["schedule", "social", "settings"].includes(tab)

  useEffect(() => {
    if (tab !== "social") return
    void loadAccounts()
  }, [tab])

  function update(patch: Partial<XAutomationRecord>) {
    if (!selected) return
    setAutomations((items) =>
      items.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item
      )
    )
  }

  async function createAutomation() {
    setBusy("create")
    try {
      const payload = await request<{ automation: XAutomationRecord }>(
        "/api/x-automations",
        {
          method: "POST",
          body: JSON.stringify({ name: "X / Threads Content Engine" }),
        }
      )
      setAutomations((items) => [payload.automation, ...items])
      setSelectedId(payload.automation.id)
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function saveAutomation() {
    if (!selected) return
    setBusy("save")
    try {
      const payload = await request<{ automation: XAutomationRecord }>(
        "/api/x-automations",
        {
          method: "PATCH",
          body: JSON.stringify({ automation: selected }),
        }
      )
      setAutomations((items) =>
        items.map((item) =>
          item.id === selected.id ? payload.automation : item
        )
      )
      toast.success("X automation saved")
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy("")
    }
  }

  async function generate(candidate = selectedCandidate) {
    if (!selected) return
    if (!selected.niche.label.trim()) {
      toast.error("Add a niche first")
      return
    }
    if (!topic.trim() && !candidate) {
      toast.error("Add a topic or select a trend first")
      return
    }
    setBusy("generate")
    try {
      await saveAutomation()
      setBusy("generate")
      const payload = await request<{ run: XAutomationRun }>(
        "/api/x-automations/generate",
        {
          method: "POST",
          body: JSON.stringify({
            automationId: selected.id,
            topic: topic.trim(),
            sourceCandidate: candidate ?? undefined,
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
      const payload = await request<{ candidates: XTrendCandidate[] }>(
        "/api/x-automations/discover",
        {
          method: "POST",
          body: JSON.stringify({
            automationId: selected.id,
            query: query.trim(),
          }),
        }
      )
      setCandidates(payload.candidates)
    } catch (error) {
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
          return integration && isXAutomationAccount(integration)
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
    <main className={cn("bg-[#f5f5f2] text-[#171714]", embedded ? "min-h-full" : "min-h-svh")}>
      {!embedded ? <header className="flex h-16 items-center justify-between border-b border-[#dfded7] bg-white px-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => window.location.assign("/app")}>
            <ArrowLeft />
          </Button>
          <div>
            <div className="text-[11px] font-bold tracking-[0.14em] text-[#8a8982] uppercase">
              Separate content engine
            </div>
            <h1 className="text-lg font-semibold">
              X / Threads Content Engine
            </h1>
          </div>
        </div>
      </header> : null}

      <div className={cn("grid", showNativePreview ? "grid-cols-[246px_minmax(460px,1fr)_minmax(360px,0.82fr)]" : "grid-cols-[246px_minmax(0,1fr)]", embedded ? "min-h-[calc(100svh-2rem)]" : "min-h-[calc(100svh-4rem)]")}>
        <aside className="flex min-h-0 flex-col border-r border-[#dfded7] bg-[#f7f7f3] p-2">
          <Button
            variant="action"
            className="mb-3 w-full"
            onClick={() => generate()}
            disabled={!selected || busy === "generate"}
          >
            {busy === "generate" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {busy === "generate" ? "Generating…" : "Generate draft"}
          </Button>
          <div className="space-y-1">
            <AutomationSettingsNavButton
              label="Overview"
              icon={Sparkles}
              active={tab === "overview"}
              onClick={() => setTab("overview")}
            />
            <div className="my-2 h-px bg-[#e1e0d8]" />
            <AutomationSettingsNavButton
              label="Content Format"
              icon={SlidersHorizontal}
              active={tab === "format"}
              onClick={() => setTab("format")}
            />
            <AutomationSettingsNavButton
              label="Hooks & Style"
              icon={MessageSquare}
              active={tab === "hooks"}
              onClick={() => setTab("hooks")}
            />
            <AutomationSettingsNavButton
              label="Discover"
              icon={Radar}
              active={tab === "discover"}
              onClick={() => setTab("discover")}
            />
            <AutomationSettingsNavButton
              label="Benchmarks"
              icon={BarChart3}
              active={tab === "benchmarks"}
              onClick={() => setTab("benchmarks")}
            />
            <div className="my-2 h-px bg-[#e1e0d8]" />
            <AutomationSettingsNavButton
              label="Schedule"
              icon={CalendarDays}
              active={tab === "schedule"}
              onClick={() => setTab("schedule")}
            />
            <AutomationSettingsNavButton
              label="Social Media Settings"
              icon={Share2}
              active={tab === "social"}
              onClick={() => setTab("social")}
            />
            <AutomationSettingsNavButton
              label="Settings"
              icon={Settings}
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          </div>
          {selected && (
            <div className="mt-auto rounded-lg border border-[#dfded7] bg-white p-3">
              <div className="text-[10px] font-bold tracking-[0.12em] text-[#8a8982] uppercase">
                One content engine
              </div>
              <div className="mt-1 text-sm font-bold">
                {selected.niche.label || "Set a niche"}
              </div>
              <div className="mt-1 text-xs text-[#77766f]">
                Single posts, threads, articles and reactions share this
                strategy.
              </div>
            </div>
          )}
        </aside>

        <section className="border-r border-[#dfded7] bg-white p-5">
          {embedded && onClose ? (
            <div className="mb-5 flex items-center justify-between border-b border-[#e7e6df] pb-4">
              <div><div className="text-[10px] font-bold tracking-[0.14em] text-[#8a8982] uppercase">Automation</div><div className="text-[15px] font-semibold">X / Threads Content Engine</div></div>
              <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft /> Back</Button>
            </div>
          ) : null}
          {!selected ? (
            <EmptyState onCreate={createAutomation} />
          ) : (
            <>
              <div className="mb-5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold tracking-[0.12em] text-[#8a8982] uppercase">
                    X / Threads
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
                      : "bg-[#e9e8e2] text-[#66655f]"
                  )}
                >
                  {selected.status === "live" ? "Live" : "Paused"}
                </button>
                <Button
                  variant="softControl"
                  onClick={saveAutomation}
                  disabled={busy === "save"}
                >
                  <Save />
                  Save
                </Button>
              </div>
              {tab === "overview" && (
                <ComposePanel
                  automation={selected}
                  topic={topic}
                  setTopic={setTopic}
                  update={update}
                />
              )}
              {tab === "format" && <AdvancedComposePanel section="format" automation={selected} update={update} />}
              {tab === "hooks" && <AdvancedComposePanel section="hooks" automation={selected} update={update} />}
              {tab === "discover" && (
                <DiscoveryPanel
                  automation={selected}
                  update={update}
                  query={query}
                  setQuery={setQuery}
                  candidates={candidates}
                  selectedCandidate={selectedCandidate}
                  onSelect={setSelectedCandidate}
                  onDiscover={discover}
                  onGenerate={generate}
                  busy={busy}
                />
              )}
              {tab === "benchmarks" && (
                <BenchmarksPanel automation={selected} />
              )}
              {tab === "schedule" && (
                <PostingSchedulePanel
                  schedule={selected.schedule}
                  onScheduleChange={(schedule) => update({ schedule })}
                  onCancel={() => setTab("overview")}
                  onSave={() => void saveAutomation().then(() => setTab("overview"))}
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
                  onCancel={() => setTab("overview")}
                  onSave={() => void saveAutomation().then(() => setTab("overview"))}
                />
              )}
              {tab === "settings" && <XGeneralSettingsPanel automation={selected} update={update} onCancel={() => setTab("overview")} onSave={() => void saveAutomation().then(() => setTab("overview"))} />}
            </>
          )}
        </section>

        {showNativePreview ? <aside className="bg-[#efeee9] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold tracking-[0.12em] text-[#85847d] uppercase">
                Native preview
              </div>
              <h2 className="text-lg font-semibold">
                {preview?.platforms.includes("threads") &&
                !preview.platforms.includes("x")
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
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ImagePlus />
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
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                    Publish
                  </Button>
                )}
            </div>
          </div>
          <XPreview run={preview} />
          {preview && <BenchmarkCard run={preview} />}
        </aside> : null}
      </div>
    </main>
  )
}

function ComposePanel({
  automation,
  topic,
  setTopic,
  update,
}: {
  automation: XAutomationRecord
  topic: string
  setTopic: (value: string) => void
  update: (patch: Partial<XAutomationRecord>) => void
}) {
  const output = automation.output
  return (
    <div className="space-y-4">
      <Panel
        title="Create a post"
        description="Give the AI a niche, format, and topic. It infers the rest for this draft."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Niche">
            <input
              value={automation.niche.label}
              onChange={(event) =>
                update({
                  niche: { ...automation.niche, label: event.target.value },
                })
              }
              placeholder="e.g. practical astrology"
            />
          </Field>
          <SelectField
            label="Content type"
            value={output.contentType}
            options={["single", "thread", "article"]}
            onChange={(value) =>
              update({
                output: { ...output, contentType: value as XContentType },
              })
            }
          />
        </div>
        <Field label="Topic">
          <textarea
            rows={4}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Why exact birth time changes a natal chart"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {output.contentType === "single" ? (
            <SelectField
              label="Length"
              value={output.singleLength}
              options={["short", "standard", "long"]}
              onChange={(value) => {
                const singleLength = value as XPostLength
                update({
                  output: {
                    ...output,
                    singleLength,
                    maxCharacters: characterLimitFor(singleLength),
                  },
                })
              }}
            />
          ) : (
            <div className="rounded-lg border border-[#deddd6] bg-[#f8f8f5] px-3 py-2 text-xs leading-5 text-[#66655f]">
              {output.contentType === "thread"
                ? `${output.threadPostCount.min}-${output.threadPostCount.max} posts by default`
                : `${output.articleWordCount.min}-${output.articleWordCount.max} words by default`}
            </div>
          )}
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
        </div>
        <label className="mt-3 flex items-start gap-3 rounded-xl border border-[#deddd6] bg-[#fafaf7] p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={automation.generation.autoInferBrief}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  autoInferBrief: event.target.checked,
                },
              })
            }
          />
          <span>
            <span className="block text-sm font-bold">
              Infer strategy from this topic
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#77766f]">
              AI chooses the audience, angle, voice, archetype, hook direction,
              structure, and CTA. Turn this off to use the manual overrides.
            </span>
          </span>
        </label>
      </Panel>

    </div>
  )
}

function AdvancedComposePanel({
  section,
  automation,
  update,
}: {
  section: "format" | "hooks"
  automation: XAutomationRecord
  update: (patch: Partial<XAutomationRecord>) => void
}) {
  const output = automation.output
  return (
    <div className="space-y-5">
      {section === "format" ? <>
      <Panel
        title="Niche → topic → post"
        description="This domain is independent from slideshow prompts and assets."
      >
        <Field label="Niche">
          <input
            value={automation.niche.label}
            onChange={(event) =>
              update({
                niche: { ...automation.niche, label: event.target.value },
              })
            }
          />
        </Field>
        <Field label="Audience">
          <input
            value={automation.niche.audience}
            onChange={(event) =>
              update({
                niche: { ...automation.niche, audience: event.target.value },
              })
            }
          />
        </Field>
        <Field label="Account promise">
          <textarea
            rows={2}
            value={automation.niche.promise}
            onChange={(event) =>
              update({
                niche: { ...automation.niche, promise: event.target.value },
              })
            }
          />
        </Field>
        <Field label="Content pillars (comma separated)">
          <input
            value={automation.niche.pillars.join(", ")}
            onChange={(event) =>
              update({
                niche: {
                  ...automation.niche,
                  pillars: csv(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="Niche keywords (comma separated)">
          <input
            value={automation.niche.keywords.join(", ")}
            onChange={(event) =>
              update({
                niche: {
                  ...automation.niche,
                  keywords: csv(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="Audience pain points (comma separated)">
          <input
            value={automation.niche.painPoints.join(", ")}
            onChange={(event) =>
              update({
                niche: {
                  ...automation.niche,
                  painPoints: csv(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="Excluded topics or claims (comma separated)">
          <input
            value={automation.niche.excludedTopics.join(", ")}
            onChange={(event) =>
              update({
                niche: {
                  ...automation.niche,
                  excludedTopics: csv(event.target.value),
                },
              })
            }
          />
        </Field>
      </Panel>
      <Panel
        title="Format"
        description="Choose one of the seven Phantom Profit structures, then choose its delivery container."
      >
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Post archetype"
            value={output.archetype}
            options={xPostArchetypes.map((item) => item.value)}
            optionLabels={Object.fromEntries(
              xPostArchetypes.map((item) => [item.value, item.label])
            )}
            onChange={(value) =>
              update({
                output: {
                  ...output,
                  archetype: value as XPostArchetype,
                },
              })
            }
          />
          <SelectField
            label="Content type"
            value={output.contentType}
            options={["single", "thread", "article"]}
            onChange={(value) =>
              update({
                output: { ...output, contentType: value as XContentType },
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Single post length"
            value={output.singleLength}
            options={["short", "standard", "long"]}
            onChange={(value) => {
              const singleLength = value as XPostLength
              update({
                output: {
                  ...output,
                  singleLength,
                  maxCharacters: characterLimitFor(singleLength),
                },
              })
            }}
          />
          <div className="rounded-lg border border-[#deddd6] bg-[#f8f8f5] px-3 py-2 text-xs leading-5 text-[#66655f]">
            {xPostArchetypes.find((item) => item.value === output.archetype)
              ?.structure ?? ""}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min thread posts">
            <input
              type="number"
              value={output.threadPostCount.min}
              onChange={(event) =>
                update({
                  output: {
                    ...output,
                    threadPostCount: {
                      ...output.threadPostCount,
                      min: Number(event.target.value),
                    },
                  },
                })
              }
            />
          </Field>
          <Field label="Max thread posts">
            <input
              type="number"
              value={output.threadPostCount.max}
              onChange={(event) =>
                update({
                  output: {
                    ...output,
                    threadPostCount: {
                      ...output.threadPostCount,
                      max: Number(event.target.value),
                    },
                  },
                })
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={output.platforms.includes("x")}
            onChange={() =>
              update({
                output: { ...output, platforms: toggle(output.platforms, "x") },
              })
            }
          />
          X
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={output.platforms.includes("threads")}
            onChange={() =>
              update({
                output: {
                  ...output,
                  platforms: toggle(output.platforms, "threads"),
                },
              })
            }
          />
          Threads
        </label>
      </Panel>
      </> : null}
      {section === "hooks" ? (
      <Panel
        title="Six separate generation stages"
        description="Each stage receives its own instruction and model call."
      >
        <Field label="Hook instruction">
          <textarea
            rows={3}
            value={automation.generation.hookPrompt}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  hookPrompt: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Setup instruction">
          <textarea
            rows={3}
            value={automation.generation.setupPrompt}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  setupPrompt: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Content instruction">
          <textarea
            rows={4}
            value={automation.generation.contentPrompt}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  contentPrompt: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Proof instruction">
          <textarea
            rows={3}
            value={automation.generation.proofPrompt}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  proofPrompt: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Curiosity gap instruction">
          <textarea
            rows={3}
            value={automation.generation.curiosityGapPrompt}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  curiosityGapPrompt: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="CTA instruction">
          <textarea
            rows={3}
            value={automation.generation.ctaPrompt}
            onChange={(event) =>
              update({
                generation: {
                  ...automation.generation,
                  ctaPrompt: event.target.value,
                },
              })
            }
          />
        </Field>
      </Panel>
      ) : null}
      {section === "format" ? (
      <Panel
        title="Post media"
        description="Configure optional generated media for this content automation."
      >
        <div className="grid grid-cols-2 gap-3">
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
          <SelectField
            label="Aspect ratio"
            value={automation.media.aspectRatio}
            options={["1:1", "4:5", "16:9"]}
            onChange={(value) =>
              update({
                media: {
                  ...automation.media,
                  aspectRatio: value as "1:1" | "4:5" | "16:9",
                },
              })
            }
          />
        </div>
        <Field label="Image direction">
          <textarea
            rows={3}
            value={automation.media.prompt}
            onChange={(event) =>
              update({
                media: { ...automation.media, prompt: event.target.value },
              })
            }
          />
        </Field>
      </Panel>
      ) : null}
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
        <div className="flex gap-2">
          <Button
            variant="action"
            onClick={onDiscover}
            disabled={busy === "discover"}
          >
            {busy === "discover" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Radar />
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
            "w-full rounded-xl border bg-white p-4 text-left",
            selectedCandidate?.id === candidate.id
              ? "border-[#171714] ring-2 ring-[#171714]/10"
              : "border-[#deddd6]"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-[#efeee9] px-2 py-1 text-[11px] font-bold uppercase">
              {candidate.source}
            </span>
            <span className="text-xs font-bold">
              {candidate.relevanceScore}/100
            </span>
          </div>
          <p className="line-clamp-4 text-sm leading-6">{candidate.text}</p>
          <div className="mt-2 text-xs text-[#77766f]">{candidate.reason}</div>
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
        title="X and Threads accounts"
        description="Connection is shared through PostFast; the destinations selected here belong only to this X automation."
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
              <Loader2 className="animate-spin" />
            ) : (
              <UserPlus />
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
            <RefreshCw className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        {error && (
          <div className="rounded-lg border border-[#efcaca] bg-[#fff7f7] px-3 py-2 text-xs font-semibold text-[#9d3434]">
            {error}
          </div>
        )}
        {loading ? (
          <CardGridSkeleton count={4} className="grid-cols-2 xl:grid-cols-2" />
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
                    "flex items-center gap-3 rounded-xl border bg-white p-3 text-left",
                    selected
                      ? "border-[#171714] ring-2 ring-[#171714]/10"
                      : "border-[#deddd6]"
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#171714] text-xs font-bold text-white">
                    {account.provider === "threads" ? "@" : "X"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {account.profile || account.name}
                    </span>
                    <span className="block text-xs text-[#77766f]">
                      {account.provider === "threads" ? "Threads" : "X"}
                    </span>
                  </span>
                  {selected && <Check className="size-4" />}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-[#d8d7d0] px-6 text-center text-sm text-[#77766f]">
            No connected X or Threads accounts found.
          </div>
        )}
      </Panel>

      <Panel
        title="Autopost"
        description="Publish immediately after a draft is generated, using only the accounts selected above."
      >
        <label className="flex items-start gap-3 rounded-xl border border-[#deddd6] p-3">
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
              <Settings className="size-4" /> Enable autopost
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#77766f]">
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
        control={<input className="h-10 w-44 rounded-lg border border-[#d8d7cf] px-3 text-sm" value={automation.generation.language} onChange={(event) => update({ generation: { ...automation.generation, language: event.target.value } })} />}
      />
      <SettingsRow
        title="Voice"
        description="Default writing voice when AI infers the post strategy"
        control={<input className="h-10 w-56 rounded-lg border border-[#d8d7cf] px-3 text-sm" value={automation.generation.voice} onChange={(event) => update({ generation: { ...automation.generation, voice: event.target.value } })} />}
      />
      <SettingsRow
        title="Generation model"
        description="AI model used by the X / Threads content stages"
        control={<input className="h-10 w-48 rounded-lg border border-[#d8d7cf] px-3 text-sm" value={automation.generation.model} onChange={(event) => update({ generation: { ...automation.generation, model: event.target.value } })} />}
      />
      <SettingsRow
        title="Require source attribution"
        description="Require factual posts to identify their supporting source"
        control={<input type="checkbox" className="size-5" checked={automation.generation.requireSourceAttribution} onChange={(event) => update({ generation: { ...automation.generation, requireSourceAttribution: event.target.checked } })} />}
      />
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function BenchmarksPanel({ automation }: { automation: XAutomationRecord }) {
  const archetype = xPostArchetypes.find(
    (item) => item.value === automation.output.archetype
  )
  return (
    <div className="grid gap-3">
      {archetype && (
        <div className="rounded-xl border border-[#171714] bg-[#171714] p-4 text-white">
          <div className="text-[11px] font-bold tracking-[0.12em] text-white/60 uppercase">
            Active benchmark
          </div>
          <div className="mt-2 text-lg font-bold">{archetype.label}</div>
          <div className="mt-1 text-sm text-white/75">
            {archetype.structure}
          </div>
          <div className="mt-3 text-xs font-bold">{archetype.target}</div>
        </div>
      )}
      {automation.benchmarks.map((benchmark) => (
        <article
          key={benchmark.id}
          className="rounded-xl border border-[#deddd6] bg-white p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold text-[#85847d] uppercase">
                {benchmark.archetype} · {benchmark.media}
              </div>
              <p className="mt-2 text-sm leading-6">{benchmark.text}</p>
            </div>
            <a
              href={benchmark.url}
              target="_blank"
              rel="noreferrer"
              className="text-[#66655f]"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-[#66655f]">
            {benchmark.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}

function XPreview({ run }: { run?: XAutomationRun }) {
  if (!run)
    return (
      <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#cfcec6] bg-white p-8 text-center text-sm text-[#85847d]">
        Generate a draft to see the X-native preview.
      </div>
    )
  return (
    <div className="overflow-hidden rounded-2xl border border-[#deddd6] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#ecebe6] px-5 py-3 text-xs">
        <span className="font-semibold text-[#77766f]">
          {run.contentType === "thread"
            ? `${run.posts.length}-post thread`
            : run.contentType}
        </span>
        <a
          href={xIntentUrl(run)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-bold text-[#171714] hover:underline"
        >
          Open in X <ExternalLink className="size-3" />
        </a>
      </div>
      {run.posts.map((post, index) => (
        <article
          key={post.id}
          className={cn("p-5", index > 0 && "border-t border-[#ecebe6]")}
        >
          <div className="flex gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#171714] text-sm font-bold text-white">
              A
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-bold">Automation</span>{" "}
                <span className="text-[#77766f]">@operator · now</span>
              </div>
              <p className="mt-1 text-[15px] leading-[1.45] whitespace-pre-wrap">
                {post.text}
              </p>
              {index === 0 && run.sourceCandidate && (
                <a
                  href={run.sourceCandidate.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-xl border border-[#deddd6] p-3 text-xs text-[#55544f]"
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
              <div className="mt-3 flex justify-between text-xs text-[#77766f]">
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
        <div className="border-t border-[#ecebe6] p-5">
          <div className="text-xs font-bold text-[#85847d] uppercase">
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
    <div className="mt-4 rounded-xl border border-[#deddd6] bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <BarChart3 className="size-4" />
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
      <div className="mt-3 grid grid-cols-5 gap-2 text-center text-[9px] text-[#77766f]">
        {metrics.map(([key, label]) => (
          <div key={key}>
            <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-[#e9e8e2]">
              <div
                className="h-full bg-[#171714]"
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
      <div className="mt-3 rounded-lg bg-[#f5f5f2] px-3 py-2 text-xs leading-5 text-[#66655f]">
        <span className="font-bold">Target:</span>{" "}
        {run.benchmark.comparison.target}
        {run.benchmark.comparison.matchedBenchmarkLabel && (
          <>
            {" "}
            · closest swipe: {run.benchmark.comparison.matchedBenchmarkLabel}
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
        <div className="mt-3 text-xs font-semibold text-[#66655f]">
          {run.publishing.skippedReason
            ? run.publishing.skippedReason
            : `${run.publishing.published} published · ${run.publishing.failed} failed`}
        </div>
      )}
      {run.benchmark.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[#77766f]">
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
    <div className="rounded-xl border border-[#deddd6] bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 mb-4 text-xs leading-5 text-[#77766f]">
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
    <label className="block text-xs font-bold text-[#66655f]">
      {label}
      <div className="mt-1 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[#d8d7d0] [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-[#d8d7d0] [&_textarea]:p-3 [&_textarea]:text-sm">
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
    <label className="text-xs font-bold text-[#66655f]">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-lg border border-[#d8d7d0] bg-white px-3 text-sm"
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
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-[70svh] place-items-center text-center">
      <div>
        <h2 className="text-xl font-semibold">
          Create your social content engine
        </h2>
        <p className="mt-2 text-sm text-[#77766f]">
          Niche + content type → generated post.
        </p>
        <Button variant="action" className="mt-4" onClick={onCreate}>
          <Plus />
          Create content engine
        </Button>
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
function toggle<T extends string>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item]
}
function accountKey(account: PostFastSocialIntegration) {
  return `${account.provider}:${account.integration_id}`
}
function isXAutomationAccount(account: PostFastSocialIntegration) {
  return (
    account.provider === "x" ||
    account.provider === "twitter" ||
    account.provider === "threads"
  )
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
    throw new Error(payload.error || `Request failed (${response.status})`)
  return payload as T
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

function xIntentUrl(run: XAutomationRun) {
  const sourceId = run.sourceCandidate?.url.match(/\/status\/(\d+)/)?.[1]
  if (run.reactionMode === "repost" && sourceId) {
    return `https://x.com/intent/retweet?tweet_id=${encodeURIComponent(sourceId)}`
  }
  const text = [run.posts[0]?.text, run.sourceCandidate?.url]
    .filter(Boolean)
    .join("\n\n")
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`
}
