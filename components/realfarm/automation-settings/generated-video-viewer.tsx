"use client"

import { useState } from "react"
import { IconTrash } from "@tabler/icons-react"

import { SocialAccountStatusRow } from "@/components/realfarm/social-account-status"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"

import {
  canDeleteCompletedSlideshow,
  formatRunDate,
  formatRunDuration,
  formatRunSchedule,
  runDurationSeconds,
  runPublishSchedule,
  runStatusLabel,
  slideshowCaption,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"
import { VideoCopyFields } from "./video-copy-fields"
import { RunPublicationStatusSelect } from "./run-publication-status-select"

export function GeneratedAutomationVideoViewer({
  run,
  onClose,
  onDelete,
  onRunChanged,
}: {
  run: AutomationRunApiRecord
  onClose: () => void
  onDelete?: () => Promise<void>
  onRunChanged?: (run: AutomationRunApiRecord) => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<
    number | null
  >(null)
  const canDelete = Boolean(onDelete && canDeleteCompletedSlideshow(run))

  return (
    <>
      <AppModal onClose={onClose}>
        <AppModalPanel
          accessibleTitle={`${slideshowTitle(run)} video`}
          className="max-h-[90vh] max-w-[880px] overflow-hidden rounded-[10px] bg-app-surface"
        >
          <AppModalHeader
            title={slideshowTitle(run)}
            description={`${runStatusLabel(run.status, run.socialStatuses, run.manuallyPublishedAt)} · ${formatRunDate(run.createdAt)}`}
            closeLabel="Close generated video"
            onClose={onClose}
            actions={
              canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                >
                  <IconTrash className="size-4" />
                  Delete
                </Button>
              ) : undefined
            }
          />

          <main className="grid max-h-[calc(90vh-73px)] gap-5 overflow-y-auto bg-app-surface-subtle p-5 md:grid-cols-[minmax(260px,360px)_1fr]">
            <section className="min-w-0">
              <div className="grid aspect-[9/16] max-h-[68vh] place-items-center overflow-hidden rounded-[9px] bg-black shadow-xl">
                {run.videoUrl ? (
                  <video
                    src={run.videoUrl}
                    poster={run.thumbnailUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full bg-black object-contain"
                    onLoadedMetadata={(event) => {
                      const duration = event.currentTarget.duration
                      setVideoDurationSeconds(
                        Number.isFinite(duration) && duration > 0
                          ? duration
                          : null
                      )
                    }}
                  />
                ) : run.status === "running" ? (
                  <div className="grid h-full w-full animate-pulse place-items-center px-6 text-center text-[13px] font-semibold text-white/75">
                    <span>
                      {run.progress?.stage || "Rendering video…"}
                      {run.progress?.detail ? (
                        <span className="mt-1 block text-[11px] font-medium text-white/50">
                          {run.progress.detail}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : (
                  <div className="grid h-full w-full place-items-center px-6 text-center text-[13px] font-semibold text-white/65">
                    This run does not have a rendered video.
                  </div>
                )}
              </div>
            </section>

            <section className="min-w-0 space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-app-panel-border bg-app-surface p-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-[0.06em] text-app-text-faint uppercase">
                    Status
                  </div>
                  <RunPublicationStatusSelect
                    run={run}
                    onRunChanged={onRunChanged}
                    className="mt-1"
                  />
                </div>
                <VideoRunDetail
                  label="Post timing"
                  value={formatRunSchedule(runPublishSchedule(run))}
                />
                <VideoRunDetail
                  label="Duration"
                  value={formatRunDuration(
                    videoDurationSeconds ?? runDurationSeconds(run)
                  )}
                />
                <VideoRunDetail
                  label="Created"
                  value={formatRunDate(run.createdAt)}
                />
                <VideoRunDetail
                  label="Type"
                  value={run.plan?.publishType || "video"}
                />
                <VideoRunDetail
                  label="Language"
                  value={run.plan?.language || "default"}
                />
              </div>

              <VideoCopyFields
                title={run.plan?.title?.trim() || slideshowTitle(run)}
                description={run.plan?.caption?.trim() || slideshowCaption(run)}
                hashtags={run.plan?.hashtags?.trim() || ""}
              />

              <div className="rounded-[10px] border border-app-panel-border bg-app-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[12px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
                    Account status
                  </div>
                  <div className="text-[12px] font-semibold text-app-muted-text">
                    {(run.socialStatuses ?? []).length} accounts
                  </div>
                </div>
                <SocialAccountStatusRow
                  items={run.socialStatuses ?? []}
                  showLabels
                  emptyLabel="No social accounts selected"
                />
              </div>

              {run.error ? (
                <div className="rounded-[10px] border border-[#f0c7c7] bg-[#fff6f6] p-4 text-[13px] font-semibold text-[#b73737]">
                  {run.error}
                </div>
              ) : null}
            </section>
          </main>
        </AppModalPanel>
      </AppModal>

      {deleteOpen && onDelete ? (
        <ConfirmDialog
          title="Delete this video?"
          description="This removes the completed video and its generated files. This action cannot be undone."
          confirmLabel="Delete video"
          pendingLabel="Deleting…"
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await onDelete()
            setDeleteOpen(false)
            onClose()
          }}
        />
      ) : null}
    </>
  )
}

function VideoRunDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold tracking-[0.06em] text-app-text-faint uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-app-text">
        {value}
      </div>
    </div>
  )
}
