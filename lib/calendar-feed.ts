/**
 * Calendar feed on the Appwrite data layer: scheduled/published posts
 * (`posts`) plus queued or failed render jobs, in the CalendarItem shape the
 * content calendar renders.
 */
import {
  calendarLifecycleForJob,
  calendarLifecycleForLocalPost,
  dedupeCalendarItems,
  type CalendarItem,
} from "@/lib/calendar-items"
import type { Job, Post, RenderSummary, Repositories, WorkspaceId } from "@/lib/data"
import { clean } from "@/lib/guards"

const DEFAULT_TIMEZONE = "UTC"

/** Scheduled/published posts plus queued or failed render jobs in [from, to]. */
export async function calendarItems(
  repos: Repositories,
  workspaceId: WorkspaceId,
  from: Date,
  to: Date
): Promise<CalendarItem[]> {
  const [posts, jobs] = await Promise.all([
    repos.posts.listRange(workspaceId, {
      from: from.toISOString(),
      to: new Date(to.getTime() + 1).toISOString(),
    }),
    repos.jobs.listForWorkspace(workspaceId, { limit: 100 }),
  ])
  const renderIds = [...new Set(posts.map((post) => post.renderId))]
  const renders = new Map<string, RenderSummary>()
  for (const id of renderIds) {
    const render = await repos.renders.get(workspaceId, id)
    if (render) renders.set(id, render)
  }
  return dedupeCalendarItems([
    ...jobs.items.flatMap((job) => jobCalendarItem(job, from, to)),
    ...posts.flatMap((post) => postCalendarItem(post, renders.get(post.renderId), from, to)),
  ])
}

function jobCalendarItem(job: Job, from: Date, to: Date): CalendarItem[] {
  if (job.type !== "render-slideshow") return []
  const status = calendarLifecycleForJob(job.status)
  if (!status) return []
  const datetime = clean(job.runAt || job.createdAt)
  if (!inRange(datetime, from, to)) return []
  return [
    {
      id: `job:${job.id}`,
      status,
      datetime,
      timezone: DEFAULT_TIMEZONE,
      targets: [],
      source: "job",
      sourceType: "render",
      sourceId: "renderId" in job.payload ? job.payload.renderId : job.id,
      title:
        status === "generation_failed"
          ? "Render failed"
          : job.status === "running"
            ? "Rendering slideshow"
            : "Render queued",
      error: job.error || undefined,
      links: {},
      timestamps: { createdAt: job.createdAt, updatedAt: job.updatedAt },
    },
  ]
}

function postCalendarItem(
  post: Post,
  render: RenderSummary | undefined,
  from: Date,
  to: Date
): CalendarItem[] {
  const status = calendarLifecycleForLocalPost(post.status)
  if (!status) return []
  const datetime = clean(post.publishedAt ?? post.publishAt ?? post.createdAt)
  if (!inRange(datetime, from, to)) return []
  const cover = render?.output?.coverFileId ?? render?.output?.slides[0]?.fileId
  const editable = post.status === "scheduled" && !post.providerPostId
  return [
    {
      id: `post:${post.id}`,
      status,
      datetime,
      slot: post.publishAt ?? undefined,
      timezone: DEFAULT_TIMEZONE,
      targets: [{ integrationId: post.accountId, provider: post.provider, status }],
      source: "local_post",
      sourceType: "render",
      sourceId: post.renderId,
      title:
        status === "published"
          ? "Published post"
          : status === "failed"
            ? "Publish failed"
            : status === "draft"
              ? "Draft post"
              : "Scheduled post",
      excerpt: post.caption || render?.title || undefined,
      previewUrl: cover ? `/api/files/renders/${encodeURIComponent(cover)}` : undefined,
      error: post.error ?? undefined,
      links: {
        live: post.permalink ?? undefined,
        cancel: editable ? `/api/calendar/items/${encodeURIComponent(post.id)}` : undefined,
        reschedule: editable ? `/api/calendar/items/${encodeURIComponent(post.id)}` : undefined,
      },
      timestamps: {
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        scheduledAt: post.publishAt ?? undefined,
        publishedAt: post.publishedAt ?? undefined,
        generatedAt: render?.completedAt ?? undefined,
        expectedPublishedAt: post.publishedAt ? undefined : (post.publishAt ?? undefined),
      },
    },
  ]
}

function inRange(value: string, from: Date, to: Date) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp >= from.getTime() && timestamp <= to.getTime()
}
