"use client"

import { useMemo, useState } from "react"
import {
  IconCheck,
  IconDownload,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type {
  LumenLabHookSummary,
  LumenLabProjectHooksResponse,
  LumenLabProjectScriptAnalysisResponse,
  LumenLabProjectSummary,
  LumenLabProjectsResponse,
} from "@/lib/lumenlab-hook-contract"
import {
  automationHookId,
  type AutomationHookItem,
} from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

export function LumenLabHookImporter({
  currentHooks,
  onImport,
}: {
  currentHooks: AutomationHookItem[]
  onImport: (hooks: AutomationHookItem[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<LumenLabProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [hooks, setHooks] = useState<LumenLabHookSummary[]>([])
  const [selectedHookIds, setSelectedHookIds] = useState<Set<string>>(
    () => new Set()
  )
  const [query, setQuery] = useState("")
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingHooks, setLoadingHooks] = useState(false)
  const [analyzingScripts, setAnalyzingScripts] = useState(false)
  const [scriptAnalysis, setScriptAnalysis] =
    useState<LumenLabProjectScriptAnalysisResponse | null>(null)
  const [error, setError] = useState("")

  const existingTexts = useMemo(
    () => new Set(currentHooks.map((hook) => normalize(hook.text))),
    [currentHooks]
  )
  const availableHooks = hooks.filter(
    (hook) => !existingTexts.has(normalize(hook.text))
  )
  const visibleHooks = availableHooks.filter((hook) =>
    normalize(hook.text).includes(normalize(query))
  )
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  )

  async function openImporter() {
    setOpen(true)
    if (projects.length > 0 || loadingProjects) return
    setLoadingProjects(true)
    setError("")
    try {
      const payload = await fetchJsonWithTimeout<LumenLabProjectsResponse>(
        "/api/integrations/lumenlab/projects",
        { toastOnError: false }
      )
      setProjects(payload.projects)
      const first = payload.projects[0]
      if (first) {
        setSelectedProjectId(first.id)
        await loadHooks(first.id)
      }
    } catch (loadError) {
      setError(
        getApiErrorMessage(loadError, "Could not load LumenLab projects.")
      )
    } finally {
      setLoadingProjects(false)
    }
  }

  async function loadHooks(projectId: string) {
    setSelectedProjectId(projectId)
    setLoadingHooks(true)
    setError("")
    setQuery("")
    setScriptAnalysis(null)
    try {
      const payload = await fetchJsonWithTimeout<LumenLabProjectHooksResponse>(
        `/api/integrations/lumenlab/projects/${encodeURIComponent(projectId)}/hooks`,
        { toastOnError: false }
      )
      setHooks(payload.hooks)
      setSelectedHookIds(
        new Set(
          payload.hooks
            .filter((hook) => !existingTexts.has(normalize(hook.text)))
            .map((hook) => hook.id)
        )
      )
    } catch (loadError) {
      setHooks([])
      setSelectedHookIds(new Set())
      setError(
        getApiErrorMessage(loadError, "Could not load hooks from LumenLab.")
      )
    } finally {
      setLoadingHooks(false)
    }
  }

  async function analyzeScripts() {
    if (!selectedProjectId || analyzingScripts) return
    setAnalyzingScripts(true)
    setError("")
    setQuery("")
    try {
      const payload =
        await fetchJsonWithTimeout<LumenLabProjectScriptAnalysisResponse>(
          `/api/integrations/lumenlab/projects/${encodeURIComponent(selectedProjectId)}/analyze-scripts`,
          { method: "POST", timeoutMs: 120_000, toastOnError: false }
        )
      setScriptAnalysis(payload)
      setHooks(payload.hooks)
      setSelectedHookIds(
        new Set(
          payload.hooks
            .filter((hook) => !existingTexts.has(normalize(hook.text)))
            .map((hook) => hook.id)
        )
      )
    } catch (analysisError) {
      setError(
        getApiErrorMessage(
          analysisError,
          "Could not analyze scripts in LumenLab."
        )
      )
    } finally {
      setAnalyzingScripts(false)
    }
  }

  function toggleHook(hookId: string) {
    setSelectedHookIds((current) => {
      const next = new Set(current)
      if (next.has(hookId)) next.delete(hookId)
      else next.add(hookId)
      return next
    })
  }

  function importSelected() {
    if (!selectedProject) return
    const importedAt = new Date().toISOString()
    const imported = availableHooks
      .filter((hook) => selectedHookIds.has(hook.id))
      .map(
        (hook) =>
          ({
            id: automationHookId(hook.text),
            text: hook.text,
            enabled: true,
            createdAt: hook.createdAt || importedAt,
            ...(hook.contentDirection
              ? { contentDirection: hook.contentDirection }
              : {}),
            ...(hook.content ? { content: hook.content } : {}),
            source: {
              provider: "lumenlab",
              projectId: selectedProject.id,
              projectTitle: selectedProject.title,
              ...(hook.sourceType === "script"
                ? { scriptId: hook.sourceId || hook.id.replace(/^script:/, "") }
                : { hookId: hook.sourceId || hook.id }),
              importedAt,
            },
          }) satisfies AutomationHookItem
      )
    onImport(imported)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => void openImporter()}
      >
        <IconDownload className="size-4" />
        Import from LumenLab
      </Button>

      {open ? (
        <AppModal onClose={() => setOpen(false)}>
          <AppModalPanel
            className="flex max-h-[min(760px,calc(100vh-2rem))] max-w-3xl flex-col overflow-hidden"
            accessibleTitle="Import hooks from LumenLab"
          >
            <AppModalHeader
              title="Import hooks from LumenLab"
              description="Import saved hooks, or analyze every project script into a hook, content direction, and source brief."
              onClose={() => setOpen(false)}
            />

            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 md:grid-cols-[15rem_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto rounded-[9px] border border-app-panel-border bg-app-surface-subtle p-2">
                <div className="px-2 py-1 text-[11px] font-bold tracking-wide text-app-text-faint uppercase">
                  Projects
                </div>
                {loadingProjects ? (
                  <p className="px-2 py-4 text-sm text-app-text-soft">
                    Loading projects…
                  </p>
                ) : projects.length > 0 ? (
                  <div className="space-y-1">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className={cn(
                          "w-full rounded-[7px] px-3 py-2 text-left text-sm font-semibold",
                          project.id === selectedProjectId
                            ? "bg-app-action text-white"
                            : "text-app-text hover:bg-app-surface"
                        )}
                        onClick={() => void loadHooks(project.id)}
                      >
                        {project.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-4 text-sm text-app-text-soft">
                    No active projects found.
                  </p>
                )}
              </aside>

              <section className="flex min-h-0 flex-col">
                <div className="flex gap-2">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Search hooks</span>
                    <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-text-faint" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search hooks"
                      className="h-10 w-full rounded-[8px] border border-app-panel-border bg-app-surface pr-3 pl-9 text-sm outline-none focus:border-app-action"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!selectedProjectId || analyzingScripts}
                    onClick={() => void analyzeScripts()}
                  >
                    <IconSparkles className="size-4" />
                    {analyzingScripts
                      ? "Analyzing scripts…"
                      : "Analyze scripts"}
                  </Button>
                </div>

                {scriptAnalysis ? (
                  <div className="mt-3 grid gap-2 rounded-[9px] border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
                    <div className="font-bold">
                      Analyzed {scriptAnalysis.scriptCount} script
                      {scriptAnalysis.scriptCount === 1 ? "" : "s"}
                    </div>
                    <div>
                      <span className="font-bold">Content direction: </span>
                      {scriptAnalysis.projectContentDirection}
                    </div>
                    <div>
                      <span className="font-bold">Content: </span>
                      {scriptAnalysis.projectContent}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-[9px] border border-app-panel-border">
                  {loadingHooks ? (
                    <p className="p-5 text-sm text-app-text-soft">
                      Loading hooks…
                    </p>
                  ) : visibleHooks.length > 0 ? (
                    <div className="divide-y divide-app-panel-border">
                      {visibleHooks.map((hook) => {
                        const selected = selectedHookIds.has(hook.id)
                        return (
                          <button
                            key={hook.id}
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-app-surface-subtle"
                            onClick={() => toggleHook(hook.id)}
                          >
                            <span
                              className={cn(
                                "mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
                                selected
                                  ? "border-app-action bg-app-action text-white"
                                  : "border-app-panel-border bg-app-surface"
                              )}
                            >
                              {selected ? (
                                <IconCheck className="size-3.5" />
                              ) : null}
                            </span>
                            <span className="min-w-0 text-sm font-medium text-app-text">
                              {hook.text}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-app-text-soft">
                      {hooks.length > 0
                        ? "All matching hooks already exist in this automation."
                        : "This project has no saved hooks. Analyze its scripts to create hooks with content direction and source content."}
                    </p>
                  )}
                </div>
                {hooks.length > availableHooks.length ? (
                  <p className="mt-2 text-xs font-medium text-app-text-faint">
                    {hooks.length - availableHooks.length} existing duplicate
                    {hooks.length - availableHooks.length === 1 ? "" : "s"}{" "}
                    hidden
                  </p>
                ) : null}
                {error ? (
                  <p
                    className="mt-3 text-sm font-medium text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
              </section>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-app-panel-border px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="action"
                disabled={selectedHookIds.size === 0}
                onClick={importSelected}
              >
                Import {selectedHookIds.size} hook
                {selectedHookIds.size === 1 ? "" : "s"}
              </Button>
            </footer>
          </AppModalPanel>
        </AppModal>
      ) : null}
    </>
  )
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ")
}
