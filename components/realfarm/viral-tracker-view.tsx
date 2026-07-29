"use client"

import { useMemo, useState } from "react"
import {
  IconAlertTriangle,
  IconBrandTiktok,
  IconCheck,
  IconClock,
  IconFlame,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"
import type {
  ViralTrackerAccount,
  ViralTrackerPost,
  ViralTrackerProject,
} from "@/lib/viral-tracker-math"
import { formatViralCheckpoint, viralThreshold } from "@/lib/viral-tracker-math"
import { cn } from "@/lib/utils"

type TrackerPayload = {
  projects: ViralTrackerProject[]
  accounts: ViralTrackerAccount[]
  posts: ViralTrackerPost[]
  configuration: {
    tikhub: boolean
    telegram: boolean
    transcription: boolean
  }
}

export function ViralTrackerView() {
  const { data, error, isLoading, mutate } = useSWR<TrackerPayload>(
    "/api/viral-tracker",
    clientSWRFetcher,
    {
      refreshInterval: 60_000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  )
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [telegramChatId, setTelegramChatId] = useState("")
  const [handle, setHandle] = useState("")
  const [busy, setBusy] = useState("")

  const resolvedProjectId = data?.projects.some(
    (project) => project.id === selectedProjectId
  )
    ? selectedProjectId
    : (data?.projects[0]?.id ?? "")
  const selectedProject = data?.projects.find(
    (project) => project.id === resolvedProjectId
  )
  const accounts = useMemo(
    () =>
      (data?.accounts ?? []).filter(
        (account) => account.projectId === resolvedProjectId
      ),
    [data?.accounts, resolvedProjectId]
  )
  const accountIds = useMemo(
    () => new Set(accounts.map((account) => account.id)),
    [accounts]
  )
  const posts = useMemo(
    () => (data?.posts ?? []).filter((post) => accountIds.has(post.accountId)),
    [accountIds, data?.posts]
  )

  async function mutateTracker(
    key: string,
    body: Record<string, unknown>,
    successMessage: string
  ) {
    setBusy(key)
    try {
      await fetchJsonWithTimeout("/api/viral-tracker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 45_000,
        toastOnError: false,
      })
      await mutate()
      toast.success(successMessage)
      return true
    } catch (mutationError) {
      toast.error(getApiErrorMessage(mutationError, "Tracker update failed"))
      return false
    } finally {
      setBusy("")
    }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault()
    const created = await mutateTracker(
      "create-project",
      {
        action: "create_project",
        name: projectName,
        telegramChatId: telegramChatId || undefined,
      },
      "Tracker project created"
    )
    if (created) {
      setProjectName("")
      setTelegramChatId("")
      setShowCreateProject(false)
    }
  }

  async function addAccount(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedProject) return
    const created = await mutateTracker(
      "add-account",
      {
        action: "add_account",
        projectId: selectedProject.id,
        handle,
      },
      "TikTok account added"
    )
    if (created) setHandle("")
  }

  async function remove(kind: "project" | "account", id: string) {
    const label =
      kind === "project" ? "project and all tracked posts" : "account"
    if (!window.confirm(`Delete this ${label}?`)) return
    setBusy(`delete:${id}`)
    try {
      await fetchJsonWithTimeout(
        `/api/viral-tracker?kind=${kind}&id=${encodeURIComponent(id)}`,
        { method: "DELETE", toastOnError: false }
      )
      await mutate()
      toast.success(kind === "project" ? "Project deleted" : "Account deleted")
    } catch (mutationError) {
      toast.error(getApiErrorMessage(mutationError, "Delete failed"))
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] pb-14">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-app-text">
          Viral tracker
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="softControl"
            size="appDefault"
            onClick={() => void mutate()}
            disabled={isLoading}
          >
            <IconRefresh
              className={cn("size-4", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            variant="action"
            size="appDefault"
            onClick={() => setShowCreateProject((current) => !current)}
          >
            <IconPlus className="size-4" />
            New project
          </Button>
        </div>
      </header>

      {error && !data ? (
        <StateCard
          icon={IconAlertTriangle}
          title="Viral tracker could not be loaded"
          detail={getApiErrorMessage(error)}
        />
      ) : isLoading && !data ? (
        <LoadingState />
      ) : (
        <>
          {!data?.configuration.tikhub ? (
            <div className="mb-5 flex items-start gap-3 rounded-control bg-app-warning-surface p-4 text-sm text-app-warning">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
              TikHub is not configured. Add TIKHUB_API_KEY to the server
              environment before adding an account.
            </div>
          ) : null}

          {showCreateProject || data?.projects.length === 0 ? (
            <ProjectForm
              name={projectName}
              telegramChatId={telegramChatId}
              busy={busy === "create-project"}
              canCancel={Boolean(data?.projects.length)}
              onNameChange={setProjectName}
              onTelegramChatIdChange={setTelegramChatId}
              onCancel={() => setShowCreateProject(false)}
              onSubmit={createProject}
            />
          ) : null}

          {data?.projects.length ? (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
              {data.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={cn(
                    "lc-focus-ring shrink-0 rounded-full border px-4 py-2 text-sm font-medium",
                    project.id === resolvedProjectId
                      ? "border-app-strong bg-app-strong text-white"
                      : "border-app-panel-border bg-app-control-bg text-app-text hover:bg-app-control-hover"
                  )}
                >
                  {project.name}
                </button>
              ))}
            </div>
          ) : null}

          {selectedProject ? (
            <>
              <section className="app-card mb-5 rounded-app-panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-app-text">Accounts</h2>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`Delete ${selectedProject.name}`}
                    disabled={busy === `delete:${selectedProject.id}`}
                    onClick={() => void remove("project", selectedProject.id)}
                  >
                    <IconTrash className="size-4" />
                    Delete project
                  </Button>
                </div>

                <form
                  onSubmit={addAccount}
                  className="mb-4 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    aria-label="TikTok username or profile URL"
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    placeholder="@username or TikTok profile URL"
                    className="lc-focus-ring h-10 min-w-0 flex-1 rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text placeholder:text-app-text-faint"
                  />
                  <Button
                    type="submit"
                    variant="action"
                    size="appDefault"
                    disabled={
                      !handle.trim() ||
                      busy === "add-account" ||
                      data?.configuration.tikhub !== true
                    }
                  >
                    <IconPlus className="size-4" />
                    {busy === "add-account"
                      ? "Loading baseline..."
                      : "Add account"}
                  </Button>
                </form>

                {accounts.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {accounts.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        busy={busy}
                        onPoll={() =>
                          void mutateTracker(
                            `poll:${account.id}`,
                            { action: "poll_account", accountId: account.id },
                            `@${account.handle} checked`
                          )
                        }
                        onStatus={(status) =>
                          void mutateTracker(
                            `status:${account.id}`,
                            {
                              action: "set_account_status",
                              accountId: account.id,
                              status,
                            },
                            status === "paused"
                              ? "Tracking paused"
                              : "Tracking resumed"
                          )
                        }
                        onRemove={() => void remove("account", account.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-control border border-dashed border-app-panel-border p-6 text-center text-sm text-app-muted-text">
                    Add a TikTok account to calculate its ten-post median
                    baseline.
                  </p>
                )}
              </section>

              <section>
                <h2 className="mb-4 text-lg font-bold text-app-text">
                  Tracked posts
                </h2>
                {posts.length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                ) : (
                  <StateCard
                    icon={IconClock}
                    title="No new posts yet"
                    detail="Posts published after an account is added appear here at the next poll."
                  />
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

function ProjectForm({
  name,
  telegramChatId,
  busy,
  canCancel,
  onNameChange,
  onTelegramChatIdChange,
  onCancel,
  onSubmit,
}: {
  name: string
  telegramChatId: string
  busy: boolean
  canCancel: boolean
  onNameChange: (value: string) => void
  onTelegramChatIdChange: (value: string) => void
  onCancel: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="app-card mb-5 rounded-app-panel p-5">
      <h2 className="mb-4 text-lg font-bold text-app-text">
        New tracker project
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-app-text">
          <span>Project name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-app-text">
          <span>Telegram chat ID (optional)</span>
          <input
            value={telegramChatId}
            onChange={(event) => onTelegramChatIdChange(event.target.value)}
            className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {canCancel ? (
          <Button
            type="button"
            variant="softControl"
            size="appDefault"
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="action"
          size="appDefault"
          disabled={!name.trim() || busy}
        >
          {busy ? "Creating..." : "Create project"}
        </Button>
      </div>
    </form>
  )
}

function AccountCard({
  account,
  busy,
  onPoll,
  onStatus,
  onRemove,
}: {
  account: ViralTrackerAccount
  busy: string
  onPoll: () => void
  onStatus: (status: "active" | "paused") => void
  onRemove: () => void
}) {
  const paused = account.status === "paused"
  return (
    <article className="rounded-control border border-app-panel-border bg-app-surface-raised p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-app-strong text-sm font-bold text-white">
          {account.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-app-text">
              {account.displayName}
            </h3>
            <StatusBadge status={account.status} />
          </div>
          <a
            href={account.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-app-muted-text hover:underline"
          >
            @{account.handle}
          </a>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric
          label="Median views"
          value={formatMetric(account.baseline.views)}
        />
        <Metric
          label="Threshold"
          value={formatMetric(
            viralThreshold(account.baseline, account.thresholdMultiplier)
          )}
        />
        <Metric label="Sample" value={String(account.baseline.sampleSize)} />
      </div>
      {account.error ? (
        <p className="mt-3 rounded-control bg-app-danger-surface p-2 text-xs text-app-danger">
          {account.error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="softControl"
          size="compact"
          disabled={busy === `poll:${account.id}`}
          onClick={onPoll}
        >
          <IconRefresh
            className={cn(
              "size-3.5",
              busy === `poll:${account.id}` && "animate-spin"
            )}
          />
          Check now
        </Button>
        <Button
          variant="ghost"
          size="compact"
          disabled={busy === `status:${account.id}`}
          onClick={() => onStatus(paused ? "active" : "paused")}
        >
          {paused ? (
            <IconPlayerPlay className="size-3.5" />
          ) : (
            <IconPlayerPause className="size-3.5" />
          )}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          className="ml-auto"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete @${account.handle}`}
          disabled={busy === `delete:${account.id}`}
          onClick={onRemove}
        >
          <IconTrash className="size-4" />
        </Button>
      </div>
    </article>
  )
}

function PostCard({ post }: { post: ViralTrackerPost }) {
  const latest = [...post.checkpoints]
    .reverse()
    .find((checkpoint) => checkpoint.capturedAt)
  return (
    <article className="app-card overflow-hidden rounded-app-panel">
      <div className="flex gap-4 p-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-control bg-app-strong text-white">
          {post.status === "qualified" ||
          post.status === "analyzing" ||
          post.status === "retained" ? (
            <IconFlame className="size-7" />
          ) : (
            <IconBrandTiktok className="size-7" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 text-sm leading-5 font-semibold text-app-text hover:underline"
            >
              {post.caption}
            </a>
            <StatusBadge status={post.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-app-muted-text">
            <span>@{post.handle}</span>
            <span>{formatDate(post.publishedAt)}</span>
            <span>
              {latest
                ? `${formatMetric(latest.views)} views`
                : "Awaiting 3:30 checkpoint"}
            </span>
          </div>
        </div>
      </div>
      <div className="flex overflow-x-auto border-t border-app-panel-border">
        {post.checkpoints.map((checkpoint) => (
          <div
            key={checkpoint.hours}
            className="w-28 shrink-0 border-r border-app-panel-border px-3 py-3 last:border-r-0"
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-app-text">
              {checkpoint.capturedAt ? (
                checkpoint.qualified ? (
                  <IconFlame className="size-3.5 text-app-action" />
                ) : (
                  <IconCheck className="size-3.5 text-app-success" />
                )
              ) : (
                <IconClock className="size-3.5 text-app-muted-text" />
              )}
              {formatViralCheckpoint(checkpoint.hours)}
            </div>
            <p className="text-xs text-app-muted-text">
              {checkpoint.capturedAt
                ? formatMetric(checkpoint.views)
                : formatDate(checkpoint.scheduledFor)}
            </p>
          </div>
        ))}
      </div>
    </article>
  )
}

function StatusBadge({ status }: { status: string }) {
  const viral = ["qualified", "analyzing", "retained"].includes(status)
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
        viral
          ? "bg-app-success-surface text-brand-success"
          : status === "error"
            ? "bg-app-danger-surface text-app-danger"
            : "bg-app-control-hover text-app-muted-text"
      )}
    >
      {status}
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-app-surface-subtle px-2 py-2">
      <div className="text-sm font-bold text-app-text tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-app-muted-text">{label}</div>
    </div>
  )
}

function StateCard({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
}) {
  return (
    <div className="grid min-h-52 place-items-center rounded-app-panel border border-dashed border-app-panel-border bg-app-surface p-8 text-center">
      <div>
        <Icon className="mx-auto mb-3 size-7 text-app-muted-text" />
        <h2 className="text-base font-semibold text-app-text">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-app-muted-text">{detail}</p>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="h-72 animate-pulse rounded-app-panel bg-app-control-hover" />
  )
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}
