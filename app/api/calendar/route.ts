import { NextResponse } from "next/server"

import {
  calendarItemMatchesFilters,
  calendarLifecycleForJob,
  calendarLifecycleForLocalPost,
  calendarLifecycleForPostFast,
  dedupeCalendarItems,
  type CalendarFilters,
  type CalendarItem,
  type CalendarTarget,
} from "@/lib/calendar-items"
import { clean, isRecord } from "@/lib/guards"
import { postfastRequest } from "@/lib/postfast-client"
import { type PostFastPostRecord } from "@/lib/postfast-posts"
import { listPublicationRecordsForRead } from "@/lib/post-repository"
import { listJobs, type Job } from "@/lib/queue"
import { listResultRecords, type ResultRecord } from "@/lib/results"

export const dynamic = "force-dynamic"

const RENDER_JOB_TYPE = "render-slideshow"
const DEFAULT_TIMEZONE = "UTC"

type SourceContext = {
  excerpt?: string
  previewUrl?: string
  generatedAt?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const parsedFrom = validDate(searchParams.get("from"))
  const parsedTo = validDate(searchParams.get("to"))
  if (
    (searchParams.has("from") && !parsedFrom) ||
    (searchParams.has("to") && !parsedTo)
  ) {
    return NextResponse.json(
      { error: "from and to must be valid ISO dates" },
      { status: 400 }
    )
  }
  const from = parsedFrom ?? startOfMonth(now)
  const to = parsedTo ?? endOfMonth(now)
  if (to < from) {
    return NextResponse.json(
      { error: "to must be after from" },
      { status: 400 }
    )
  }

  const [results, localPosts, jobs] = await Promise.all([
    listResultRecords({ limit: 500 }),
    listPublicationRecordsForRead({ surface: "calendar" }),
    listJobs({ type: RENDER_JOB_TYPE, limit: 500 }).catch(() => []),
  ])
  const sourceContexts = sourceContextMap(results)
  const localByPostFastId = new Map(
    localPosts.flatMap((post) =>
      post.postfastPostId ? [[post.postfastPostId, post] as const] : []
    )
  )

  const jobItems = jobs.flatMap((job) => jobCalendarItem(job, from, to))
  const localItems = localPosts.flatMap((post) =>
    localPostCalendarItem(post, sourceContexts, from, to)
  )
  const remoteItems = await remoteCalendarItems({
    from,
    to,
    localByPostFastId,
    sourceContexts,
  }).catch(() => [])
  const mergedItems = dedupeCalendarItems([
    ...jobItems,
    ...localItems,
    ...remoteItems,
  ])
  const filters = calendarFilters(searchParams)
  const items = mergedItems.filter((item) =>
    calendarItemMatchesFilters(item, filters)
  )

  return NextResponse.json({
    items,
    summary: calendarSummary(items),
    range: { from: from.toISOString(), to: to.toISOString() },
  })
}

function jobCalendarItem(job: Job, from: Date, to: Date): CalendarItem[] {
  if (job.type !== RENDER_JOB_TYPE) return []
  const status = calendarLifecycleForJob(job.status)
  if (!status) return []
  const datetime = clean(job.availableAt || job.createdAt)
  if (!inRange(datetime, from, to)) return []
  return [
    {
      id: `job:${job.id}`,
      status,
      datetime,
      timezone: DEFAULT_TIMEZONE,
      targets: [],
      source: "job",
      sourceType: "slideshow",
      sourceId: job.id,
      title:
        status === "generation_failed"
          ? "Render failed"
          : job.status === "processing"
            ? "Rendering slideshow"
            : "Render queued",
      error: job.error || undefined,
      links: {},
      timestamps: {
        createdAt: job.createdAt || undefined,
        updatedAt: job.updatedAt || undefined,
      },
    },
  ]
}

function localPostCalendarItem(
  post: PostFastPostRecord,
  sourceContexts: Map<string, SourceContext>,
  from: Date,
  to: Date
): CalendarItem[] {
  const status = calendarLifecycleForLocalPost(post.status)
  if (!status) return []
  // Posts that PostFast scheduled/published also come back through the remote
  // /social-posts feed. Only surface local publications the remote feed omits
  // (e.g. manually linked posts) so published posts are not double-counted.
  if (status === "published" && post.postfastPostId) return []
  const context = sourceContexts.get(post.sourceId)
  const datetime =
    status === "published"
      ? clean(post.publishedAt) || clean(post.scheduledAt || post.createdAt)
      : clean(post.scheduledAt || post.createdAt)
  if (!inRange(datetime, from, to)) return []
  const target: CalendarTarget = {
    integrationId: post.integrationId,
    provider: post.provider,
    status,
  }
  return [
    {
      id: `local:${post.id}`,
      status,
      datetime,
      slot: post.scheduledAt,
      timezone: DEFAULT_TIMEZONE,
      targets: [target],
      source: "local_post",
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      title: localPostTitle(post.status),
      excerpt: post.content || context?.excerpt,
      previewUrl: context?.previewUrl,
      error: post.error,
      links: {
        live: clean(post.releaseUrl),
      },
      timestamps: {
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        scheduledAt: post.scheduledAt,
        generatedAt: context?.generatedAt,
        expectedPublishedAt: post.publishedAt ? undefined : post.scheduledAt,
        publishedAt: post.publishedAt,
      },
    },
  ]
}

async function remoteCalendarItems(input: {
  from: Date
  to: Date
  localByPostFastId: Map<string, PostFastPostRecord>
  sourceContexts: Map<string, SourceContext>
}) {
  const payload = await postfastRequest("/social-posts", {
    query: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      page: 0,
      limit: 200,
    },
  })
  const record = isRecord(payload) ? payload : {}
  const posts = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.posts)
      ? record.posts
      : Array.isArray(payload)
        ? payload
        : []
  return posts.flatMap<CalendarItem>((value, index) => {
    const post = isRecord(value) ? value : {}
    const status = calendarLifecycleForPostFast(clean(post.status))
    if (!status) return []
    const postId = clean(post.id)
    const local = input.localByPostFastId.get(postId)
    const context = local ? input.sourceContexts.get(local.sourceId) : undefined
    const scheduledAt = clean(post.scheduledAt) || local?.scheduledAt
    const publishedAt = clean(post.publishedAt)
    const datetime =
      status === "published"
        ? publishedAt || scheduledAt || clean(post.createdAt)
        : scheduledAt || clean(post.createdAt)
    if (!inRange(datetime, input.from, input.to)) return []
    const integration = isRecord(post.integration) ? post.integration : {}
    const provider = clean(
      integration.providerIdentifier || local?.provider || post.provider
    ).toLowerCase()
    const integrationId = clean(
      integration.id || local?.integrationId || post.socialMediaId
    )
    const target: CalendarTarget = {
      integrationId: integrationId || undefined,
      integrationName: clean(integration.name) || undefined,
      provider: provider || "unknown",
      status,
    }
    return [
      {
        id: `postfast:${postId || index}`,
        status,
        datetime,
        slot: scheduledAt || undefined,
        timezone: DEFAULT_TIMEZONE,
        targets: [target],
        source: "postfast",
        sourceType: local?.sourceType || clean(post.sourceType) || "external",
        sourceId: local?.sourceId || postId || `remote-${index}`,
        title: status === "published" ? "Published post" : "Scheduled post",
        excerpt: clean(post.content) || local?.content || context?.excerpt,
        previewUrl: context?.previewUrl,
        links: {
          live: clean(post.releaseURL || post.releaseUrl || local?.releaseUrl),
          cancel:
            status === "scheduled" && postId
              ? `/api/calendar/items/${encodeURIComponent(local?.id || `postfast:${postId}`)}`
              : undefined,
          reschedule:
            status === "scheduled" && postId && local?.id
              ? `/api/calendar/items/${encodeURIComponent(local.id)}`
              : undefined,
        },
        timestamps: {
          createdAt: clean(post.createdAt) || local?.createdAt,
          updatedAt: clean(post.updatedAt) || local?.updatedAt,
          scheduledAt: scheduledAt || undefined,
          publishedAt: publishedAt || undefined,
          generatedAt: context?.generatedAt,
          expectedPublishedAt: publishedAt
            ? undefined
            : scheduledAt || undefined,
        },
      },
    ]
  })
}

function sourceContextMap(results: ResultRecord[]) {
  const contexts = new Map<string, SourceContext>()
  for (const result of results) {
    const context: SourceContext = {
      excerpt: result.title,
      previewUrl:
        result.artifacts.thumbnailUrl || result.artifacts.outputImages?.[0],
      generatedAt: result.createdAt,
    }
    contexts.set(result.id, context)
    if (result.artifacts.slideshowId) {
      contexts.set(result.artifacts.slideshowId, context)
    }
  }
  return contexts
}

function localPostTitle(status: PostFastPostRecord["status"]) {
  if (status === "awaiting_manual_post") return "Manual post due"
  if (status === "ready_for_review") return "Post needs review"
  if (status === "failed") return "Publish failed"
  if (status === "published") return "Published post"
  return "Draft post"
}

function calendarFilters(searchParams: URLSearchParams): CalendarFilters {
  return {
    accounts: filterSet(searchParams, "accounts"),
    platforms: filterSet(searchParams, "platforms", true),
    statuses: filterSet(searchParams, "statuses"),
    sourceTypes: filterSet(searchParams, "sourceType"),
  }
}

function filterSet(
  searchParams: URLSearchParams,
  key: string,
  lowercase = false
) {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => clean(value))
    .filter(Boolean)
    .map((value) => (lowercase ? value.toLowerCase() : value))
  return values.length ? new Set(values) : undefined
}

function calendarSummary(items: CalendarItem[]) {
  return {
    needsAction: items.filter((item) => item.status === "needs_action").length,
    failed: items.filter((item) =>
      ["generation_failed", "failed"].includes(item.status)
    ).length,
    planned: items.filter((item) => item.status === "planned").length,
  }
}

function validDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function inRange(value: string, from: Date, to: Date) {
  const timestamp = Date.parse(value)
  return (
    Number.isFinite(timestamp) &&
    timestamp >= from.getTime() &&
    timestamp <= to.getTime()
  )
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}
