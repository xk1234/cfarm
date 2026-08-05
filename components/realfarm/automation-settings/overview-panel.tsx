import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { LuPencil } from "react-icons/lu"

import { AvatarDot } from "@/components/realfarm/shared-media"
import { GeneratedVideoExports } from "@/components/realfarm/generated-video-exports"
import {
  AutomationGenerationEmptyState,
  AutomationGenerationGrid,
} from "./automation-generation-grid"
import { GeneratedSlideshowViewerModal } from "./generated-slideshow-viewer"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { CheckedDropdownButton } from "@/components/ui/form-controls"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import type { Automation } from "@/lib/realfarm-data"
import {
  automationPostingMode,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"

import {
  automationOverviewRunState,
  isSlideshowLifecycleRun,
  sortAutomationRuns,
} from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"
import type { AutomationRunSort } from "./run-helpers"
import { AutomationRecentRunCard } from "./automation-recent-run-card"

const automationRunSortOptions: AutomationRunSort[] = ["Recent", "Most viewed"]
const generatedPostsPageSize = 6

export function AutomationOverviewPanel({
  automation,
  initialRunId,
  config,
  editingName,
  draftName,
  recentRuns,
  recentRunsLoading,
  recentRunsError,
  onRetryRecentRuns,
  videoExports,
  videoExportsLoading,
  onVideoDeleted,
  onDraftNameChange,
  onStartNameEdit,
  onSaveName,
  onCancelNameEdit,
  onDeleteRun,
  onRunChanged,
}: {
  automation: Automation
  initialRunId?: string
  config: AutomationSchema
  editingName: boolean
  draftName: string
  recentRuns: AutomationRunApiRecord[]
  recentRunsLoading: boolean
  recentRunsError: string
  onRetryRecentRuns: () => void
  videoExports: GeneratedVideoExport[]
  videoExportsLoading: boolean
  onVideoDeleted: (id: string) => void
  onDraftNameChange: (value: string) => void
  onStartNameEdit: () => void
  onSaveName: () => void
  onCancelNameEdit: () => void
  onDeleteRun: (run: AutomationRunApiRecord) => Promise<void>
  onRunChanged: (run: AutomationRunApiRecord) => void
}) {
  const [viewerRun, setViewerRun] = useState<AutomationRunApiRecord | null>(
    null
  )
  const [openedInitialRun, setOpenedInitialRun] = useState(false)
  const [debugRun, setDebugRun] = useState<AutomationRunApiRecord | null>(null)
  const [runSort, setRunSort] = useState<AutomationRunSort>("Recent")
  const [runPage, setRunPage] = useState(0)
  const isVideoAutomation = automation.automationKind === "video"
  const isUgcAutomation = automation.automationKind === "ugc"
  const slideshowRuns = useMemo(
    () => recentRuns.filter(isSlideshowLifecycleRun),
    [recentRuns]
  )
  const sortedRuns = useMemo(
    () => sortAutomationRuns(slideshowRuns, runSort),
    [slideshowRuns, runSort]
  )
  const runPageCount = Math.max(
    1,
    Math.ceil(sortedRuns.length / generatedPostsPageSize)
  )
  const activeRunPage = Math.min(runPage, runPageCount - 1)
  const visibleRuns = sortedRuns.slice(
    activeRunPage * generatedPostsPageSize,
    (activeRunPage + 1) * generatedPostsPageSize
  )
  const recentRunState = automationOverviewRunState(
    slideshowRuns,
    recentRunsLoading
  )
  const totalViews = slideshowRuns.reduce(
    (total, run) => total + (run.views ?? 0),
    0
  )
  const resultsLoading = isVideoAutomation
    ? videoExportsLoading
    : recentRunsLoading

  useEffect(() => {
    if (!initialRunId || recentRunsLoading || openedInitialRun) return
    const requestedRun = recentRuns.find(
      (run) => run.id === initialRunId || run.slideshowId === initialRunId
    )
    const timeout = window.setTimeout(() => {
      if (requestedRun) setViewerRun(requestedRun)
      setOpenedInitialRun(true)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [initialRunId, openedInitialRun, recentRuns, recentRunsLoading])

  return (
    <div className="min-h-full bg-app-surface">
      <div className="h-[106px] bg-gradient-to-r from-[#90464b] via-[#9a707d] to-[#94a1b0]" />
      <div className="px-4 pb-8 sm:px-6">
        <div className="-mt-8 flex justify-center">
          <AvatarDot
            name={automation.name}
            index={12}
            className="size-16 border-4 border-white"
          />
        </div>
        <div className="mt-4 flex justify-center">
          {editingName ? (
            <input
              className="h-9 min-w-[260px] rounded-[7px] border border-app-panel-border bg-app-surface px-3 text-center text-[19px] font-semibold ring-2 ring-app-action/20 outline-none"
              value={draftName}
              autoFocus
              onChange={(event) => onDraftNameChange(event.target.value)}
              onBlur={onSaveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSaveName()
                }
                if (event.key === "Escape") {
                  onCancelNameEdit()
                }
              }}
            />
          ) : (
            <div className="flex max-w-full items-center justify-center gap-2">
              <h2 className="truncate text-center text-[19px] font-bold text-[#20201d]">
                {automation.name}
              </h2>
              <button
                className="grid size-6 place-items-center rounded-full text-app-text-faint hover:bg-app-surface-subtle hover:text-app-text"
                onClick={onStartNameEdit}
                aria-label="Edit automation name"
              >
                <LuPencil className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-center">
          <span className="rounded-[5px] bg-app-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-app-text-soft">
            {automationPostingMode(config) === "review"
              ? "Review before publish"
              : automationPostingMode(config) === "auto"
                ? "Auto publishing"
                : "Manual publishing"}
          </span>
        </div>

        {/* Four across on a phone squeezed "Engagement" wider than its cell. */}
        <div className="mx-auto mt-4 grid max-w-[494px] grid-cols-2 overflow-hidden rounded-[10px] border border-[#e2e1da] sm:grid-cols-4">
          {[
            [totalViews.toLocaleString(), "Views"],
            ["0", "Likes"],
            ["0", "Bookmarks"],
            ["0.0%", "Engagement"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="border-r border-b border-[#e2e1da] px-3 py-3 text-center last:border-r-0 sm:border-b-0 sm:px-4 sm:last:border-b-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r [&:nth-child(n+3)]:border-b-0"
            >
              {resultsLoading ? (
                <SkeletonBlock className="mx-auto h-[22px] w-12 rounded" />
              ) : (
                <div className="text-[18px] font-bold text-app-text">
                  {value}
                </div>
              )}
              <div className="mt-1 text-[11px] font-medium text-app-muted-text">
                {label}
              </div>
            </div>
          ))}
        </div>

        {isUgcAutomation ? (
          <div className="mx-auto mt-5 max-w-[494px]">
            <h3 className="mb-3 text-sm font-bold text-app-text">UGC runs</h3>
            {recentRunsLoading ? (
              <SkeletonBlock className="h-20 w-full rounded-lg" />
            ) : recentRuns.length ? (
              <div className="space-y-2">
                {recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/app/ugc/${encodeURIComponent(run.id)}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-app-panel-border p-3 text-sm font-semibold text-app-text transition hover:bg-app-surface-subtle"
                  >
                    <span className="min-w-0 truncate">
                      {run.plan?.title ||
                        run.automationTitle ||
                        "UGC generation"}
                    </span>
                    <span className="shrink-0 text-app-muted-text capitalize">
                      {run.status} · View progress
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <AutomationGenerationEmptyState>
                Generated UGC runs will appear here.
              </AutomationGenerationEmptyState>
            )}
          </div>
        ) : isVideoAutomation ? (
          <div className="mx-auto mt-5 max-w-[494px]">
            {videoExportsLoading ? (
              <AutomationGenerationGrid
                role="status"
                aria-label="Loading generated videos"
              >
                {Array.from({ length: 3 }, (_, index) => (
                  <SkeletonBlock
                    key={index}
                    className="aspect-[9/16] w-full rounded-[8px]"
                  />
                ))}
              </AutomationGenerationGrid>
            ) : (
              <GeneratedVideoExports
                title="Generated videos"
                exports={videoExports}
                emptyMessage="No generated videos yet. Use Generate to create one."
                onDeleted={onVideoDeleted}
                variant="automation"
              />
            )}
          </div>
        ) : (
          <div className="mx-auto mt-5 max-w-[494px]">
            <div className="mb-3 w-[148px]">
              <CheckedDropdownButton
                value={runSort}
                options={automationRunSortOptions}
                onChange={(value) => {
                  if (value === "Recent" || value === "Most viewed") {
                    setRunSort(value)
                    setRunPage(0)
                  }
                }}
                className="w-full"
              />
            </div>
            {recentRunsError ? (
              <AutomationGenerationEmptyState>
                <p>{recentRunsError}</p>
                <button
                  type="button"
                  className="mt-3 rounded-[7px] border border-app-panel-border bg-app-surface px-3 py-2 text-[12px] font-semibold"
                  onClick={onRetryRecentRuns}
                >
                  Try again
                </button>
              </AutomationGenerationEmptyState>
            ) : recentRunState === "runs" ? (
              <>
                <AutomationGenerationGrid>
                  {visibleRuns.map((run) => (
                    <AutomationRecentRunCard
                      key={run.id}
                      run={run}
                      mediaKind="slideshow"
                      onOpen={() => setViewerRun(run)}
                    />
                  ))}
                </AutomationGenerationGrid>
                {runPageCount > 1 ? (
                  <nav
                    className="mt-4 flex items-center justify-between gap-3"
                    aria-label="Generated posts pagination"
                  >
                    <span className="text-xs font-semibold text-app-muted-text">
                      Page {activeRunPage + 1} of {runPageCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="grid size-9 place-items-center rounded-lg border border-app-panel-border bg-app-surface text-app-text transition hover:bg-app-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={activeRunPage === 0}
                        onClick={() =>
                          setRunPage(Math.max(0, activeRunPage - 1))
                        }
                        aria-label="Previous generated posts page"
                      >
                        <IconChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="grid size-9 place-items-center rounded-lg border border-app-panel-border bg-app-surface text-app-text transition hover:bg-app-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={activeRunPage === runPageCount - 1}
                        onClick={() =>
                          setRunPage(
                            Math.min(runPageCount - 1, activeRunPage + 1)
                          )
                        }
                        aria-label="Next generated posts page"
                      >
                        <IconChevronRight className="size-4" />
                      </button>
                    </div>
                  </nav>
                ) : null}
              </>
            ) : recentRunState === "loading" ? (
              <AutomationGenerationGrid
                role="status"
                aria-label="Loading recent slideshows"
              >
                {Array.from({ length: 3 }, (_, index) => (
                  <SkeletonBlock
                    key={index}
                    className="aspect-[9/16] w-full rounded-[8px]"
                  />
                ))}
              </AutomationGenerationGrid>
            ) : (
              <AutomationGenerationEmptyState>
                No generated slideshows yet.
              </AutomationGenerationEmptyState>
            )}
          </div>
        )}
      </div>
      {viewerRun ? (
        <GeneratedSlideshowViewerModal
          run={viewerRun}
          onClose={() => setViewerRun(null)}
          onDebug={() => setDebugRun(viewerRun)}
          onDelete={async () => {
            await onDeleteRun(viewerRun)
            setViewerRun(null)
          }}
          onRunChanged={onRunChanged}
        />
      ) : null}
      {debugRun && (
        <AutomationRunDebugModal
          run={debugRun}
          onClose={() => setDebugRun(null)}
        />
      )}
    </div>
  )
}

function AutomationRunDebugModal({
  run,
  onClose,
}: {
  run: AutomationRunApiRecord
  onClose: () => void
}) {
  const promptDebug = run.plan?.debug?.textModelPrompt
  const promptDebugText = promptDebug
    ? JSON.stringify(promptDebug, null, 2)
    : "No text model prompt was sent."

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        accessibleTitle="Generation debug"
        className="max-w-[720px] rounded-[8px] bg-app-surface p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-app-text">
              Generation debug
            </h2>
            <div className="text-[12px] font-medium text-app-muted-text">
              Model: {run.plan?.textModel || "not run"} · Source hook #
              {(run.plan?.debug?.selectedHookIndex ?? 0) + 1}
            </div>
          </div>
          <button
            className="grid size-8 place-items-center rounded-[5px] text-app-muted-text hover:bg-app-surface-subtle"
            onClick={onClose}
            aria-label="Close generation debug"
          >
            <IconX className="size-5" />
          </button>
        </div>
        {run.plan?.hookCandidates?.length ? (
          <div className="mb-3 rounded-[6px] bg-app-surface-subtle p-3 text-[12px] font-medium text-app-text-soft">
            {run.plan.hookCandidates.join(" | ")}
          </div>
        ) : null}
        <pre className="max-h-[420px] overflow-auto rounded-[6px] bg-[#1f201d] p-3 text-[11px] leading-4 whitespace-pre-wrap text-white">
          {promptDebugText}
        </pre>
      </AppModalPanel>
    </AppModal>
  )
}
