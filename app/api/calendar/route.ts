import { NextResponse } from "next/server"

import {
  automationSlotsInRange,
  generationExpectedAt,
  slideshowGenerationLeadMinutes,
} from "@/lib/automation-slots"
import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import {
  automationRecordToSummary,
  listAutomationRecords,
} from "@/lib/automations"
import {
  calendarItemMatchesFilters,
  calendarLifecycleForJob,
  calendarLifecycleForLocalPost,
  calendarLifecycleForPostFast,
  dedupeCalendarItems,
  type CalendarFilters,
  type CalendarItem,
  type CalendarLifecycleStatus,
  type CalendarTarget,
} from "@/lib/calendar-items"
import { clean, isRecord } from "@/lib/guards"
import { postfastRequest } from "@/lib/postfast-client"
import {
  listPostFastPostRecords,
  type PostFastPostRecord,
} from "@/lib/postfast-posts"
import { listJobs, type Job } from "@/lib/queue"
import type { Automation } from "@/lib/realfarm-data"
import { listResultRecords, type ResultRecord } from "@/lib/results"
import {
  xAutomationToAutomation,
  type XAutomationRun,
} from "@/lib/x-automation"
import { listXAutomationRuns, listXAutomations } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

type RunContext = {
  automationId: string
  slot: string
  sourceId: string
  excerpt?: string
  previewUrl?: string
  createdAt?: string
  updatedAt?: string
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

  const [
    automationRecords,
    xAutomations,
    runs,
    xRuns,
    results,
    localPosts,
    jobs,
  ] = await Promise.all([
    listAutomationRecords(),
    listXAutomations(),
    listAutomationRuns({ limit: 500 }),
    listXAutomationRuns(),
    listResultRecords({ limit: 500 }),
    listPostFastPostRecords(),
    listJobs({ limit: 500 }).catch(() => []),
  ])
  const automations = [
    ...automationRecords.map(automationRecordToSummary),
    ...xAutomations.map(xAutomationToAutomation),
  ]
  const automationById = new Map(
    automations.map((automation) => [automation.id, automation])
  )
  const runContexts = runContextMap(runs, xRuns, results)
  const localByPostFastId = new Map(
    localPosts.flatMap((post) =>
      post.postfastPostId ? [[post.postfastPostId, post] as const] : []
    )
  )

  const projected = projectionItems(automations, from, to, now)
  const jobItems = jobs.flatMap((job) =>
    jobCalendarItem(job, automationById, from, to)
  )
  const localItems = localPosts.flatMap((post) =>
    localPostCalendarItem(post, runContexts, automationById, from, to)
  )
  const remoteItems = await remoteCalendarItems({
    from,
    to,
    localByPostFastId,
    runContexts,
    automationById,
  }).catch(() => [])
  const mergedItems = dedupeCalendarItems([
    ...projected,
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

function projectionItems(
  automations: Automation[],
  from: Date,
  to: Date,
  now: Date
) {
  return automations.flatMap((automation) =>
    automationSlotsInRange(automation, from, to).flatMap<CalendarItem>(
      (slot) => {
        if (Date.parse(slot.scheduledFor) < now.getTime()) return []
        const targets = automationTargets(automation, "planned")
        return [
          {
            id: `planned:${slot.automationId}:${slot.scheduledFor}`,
            status: "planned",
            datetime: slot.scheduledFor,
            slot: slot.scheduledFor,
            timezone: slot.timezone,
            automationId: slot.automationId,
            automationName: slot.automationName,
            targets,
            source: "projection",
            sourceType: "automation",
            sourceId: slot.automationId,
            title: slot.paused
              ? "Paused automation slot"
              : "Planned content slot",
            paused: slot.paused,
            links: {
              automation: automationLink(slot.automationId),
            },
            timestamps: {
              scheduledAt: slot.scheduledFor,
              expectedGenerationAt: expectedGenerationAt(
                automation,
                slot.scheduledFor
              ),
              expectedPublishedAt: slot.scheduledFor,
            },
          },
        ]
      }
    )
  )
}

function jobCalendarItem(
  job: Job,
  automationById: Map<string, Automation>,
  from: Date,
  to: Date
): CalendarItem[] {
  if (job.type !== "run-automation" && job.type !== "run-x-automation") {
    return []
  }
  const status = calendarLifecycleForJob(job.status)
  if (!status) return []
  const payload = isRecord(job.payload) ? job.payload : {}
  const slot = clean(payload.scheduledFor)
  const datetime = slot || clean(job.availableAt || job.createdAt)
  if (!inRange(datetime, from, to)) return []
  const automationId = clean(payload.automationId)
  const automation = automationById.get(automationId)
  const result = isRecord(job.result) ? job.result : {}
  const runId = clean(result.runId)
  return [
    {
      id: `job:${job.id}`,
      status,
      datetime,
      slot: slot || undefined,
      timezone: automationTimezone(automation),
      automationId: automationId || undefined,
      automationName: automation?.name,
      targets: automationTargets(automation, status),
      source: "job",
      sourceType:
        job.type === "run-x-automation" ? "x_automation" : "automation",
      sourceId: job.id,
      title:
        status === "generation_failed"
          ? "Generation failed"
          : job.status === "processing"
            ? "Generating content"
            : job.attempts > 0
              ? `Generation retry ${job.attempts + 1}`
              : "Generation queued",
      error: job.error || undefined,
      links: {
        automation: automationId ? automationLink(automationId) : undefined,
        content:
          automationId && runId ? contentLink(automationId, runId) : undefined,
        retry:
          status === "generation_failed"
            ? `/api/jobs/${encodeURIComponent(job.id)}/retry`
            : undefined,
      },
      timestamps: {
        createdAt: job.createdAt || undefined,
        updatedAt: job.updatedAt || undefined,
        scheduledAt: slot || undefined,
        expectedGenerationAt: expectedGenerationAt(
          automation,
          slot || datetime,
          job.type === "run-x-automation"
        ),
        expectedPublishedAt: slot || undefined,
      },
    },
  ]
}

function localPostCalendarItem(
  post: PostFastPostRecord,
  runContexts: Map<string, RunContext>,
  automationById: Map<string, Automation>,
  from: Date,
  to: Date
): CalendarItem[] {
  const status = calendarLifecycleForLocalPost(post.status)
  if (!status) return []
  const context = runContexts.get(post.sourceId)
  const automationId =
    context?.automationId ||
    (automationById.has(post.sourceId) ? post.sourceId : undefined)
  const automation = automationId ? automationById.get(automationId) : undefined
  const datetime = context?.slot || clean(post.scheduledAt || post.createdAt)
  if (!inRange(datetime, from, to)) return []
  const target = postTarget(post, status, automation)
  return [
    {
      id: `local:${post.id}`,
      status,
      datetime,
      slot: context?.slot || post.scheduledAt,
      timezone: automationTimezone(automation),
      automationId,
      automationName: automation?.name,
      targets: [target],
      source: "local_post",
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      title: localPostTitle(post.status),
      excerpt: post.content || context?.excerpt,
      previewUrl: context?.previewUrl,
      error: post.error,
      links: {
        automation: automationId ? automationLink(automationId) : undefined,
        content: automationId
          ? contentLink(automationId, post.sourceId)
          : undefined,
      },
      timestamps: {
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        scheduledAt: post.scheduledAt || context?.slot,
        generatedAt: context?.generatedAt,
        expectedGenerationAt: context?.generatedAt
          ? undefined
          : expectedGenerationAt(
              automation,
              context?.slot || post.scheduledAt || datetime,
              post.sourceType === "x_automation"
            ),
        expectedPublishedAt: post.publishedAt
          ? undefined
          : post.scheduledAt || context?.slot,
        publishedAt: post.publishedAt,
      },
    },
  ]
}

async function remoteCalendarItems(input: {
  from: Date
  to: Date
  localByPostFastId: Map<string, PostFastPostRecord>
  runContexts: Map<string, RunContext>
  automationById: Map<string, Automation>
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
    const context = local ? input.runContexts.get(local.sourceId) : undefined
    const automationId = context?.automationId
    const automation = automationId
      ? input.automationById.get(automationId)
      : undefined
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
    const targetAutomation =
      automation ||
      automationForIntegration(input.automationById, integrationId)
    const target: CalendarTarget = {
      integrationId: integrationId || undefined,
      integrationName:
        clean(integration.name) ||
        integrationName(targetAutomation, integrationId),
      provider:
        provider ||
        targetAutomation?.socialIntegrations.find(
          (candidate) => candidate.integration_id === integrationId
        )?.provider ||
        "unknown",
      status,
    }
    return [
      {
        id: `postfast:${postId || index}`,
        status,
        datetime,
        slot: context?.slot || scheduledAt || undefined,
        timezone: automationTimezone(targetAutomation),
        automationId,
        automationName: automation?.name,
        targets: [target],
        source: "postfast",
        sourceType: local?.sourceType || clean(post.sourceType) || "external",
        sourceId: local?.sourceId || postId || `remote-${index}`,
        title: status === "published" ? "Published post" : "Scheduled post",
        excerpt: clean(post.content) || local?.content || context?.excerpt,
        previewUrl: context?.previewUrl,
        links: {
          automation: automationId ? automationLink(automationId) : undefined,
          content:
            automationId && local
              ? contentLink(automationId, local.sourceId)
              : undefined,
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
          expectedGenerationAt: context?.generatedAt
            ? undefined
            : expectedGenerationAt(
                targetAutomation,
                context?.slot || scheduledAt || datetime,
                local?.sourceType === "x_automation"
              ),
          expectedPublishedAt: publishedAt
            ? undefined
            : scheduledAt || context?.slot || undefined,
        },
      },
    ]
  })
}

function runContextMap(
  runs: AutomationRunRecord[],
  xRuns: XAutomationRun[],
  results: ResultRecord[]
) {
  const contexts = new Map<string, RunContext>()
  const resultByRunId = new Map(
    results.map((result) => [result.runId, result] as const)
  )
  for (const run of runs) {
    const result = resultByRunId.get(run.id)
    const context = {
      automationId: run.automationId,
      slot: run.scheduledFor,
      sourceId: run.id,
      excerpt: run.plan?.caption || run.plan?.hook,
      previewUrl: run.thumbnailUrl,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      generatedAt: result?.createdAt,
    }
    contexts.set(run.id, context)
    if (run.slideshowId) contexts.set(run.slideshowId, context)
  }
  for (const run of xRuns) {
    contexts.set(run.id, {
      automationId: run.automationId,
      slot: run.scheduledFor || run.createdAt,
      sourceId: run.id,
      excerpt: run.posts[0]?.text || run.hook,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      generatedAt: run.createdAt,
    })
  }
  return contexts
}

function automationTargets(
  automation: Automation | undefined,
  status: CalendarLifecycleStatus
): CalendarTarget[] {
  return (automation?.socialIntegrations || [])
    .filter((integration) => !integration.disabled)
    .map((integration) => ({
      integrationId: integration.integration_id,
      integrationName: integration.name,
      provider: integration.provider,
      status,
    }))
}

function postTarget(
  post: PostFastPostRecord,
  status: CalendarLifecycleStatus,
  automation: Automation | undefined
): CalendarTarget {
  return {
    integrationId: post.integrationId,
    integrationName: integrationName(automation, post.integrationId),
    provider: post.provider,
    status,
  }
}

function integrationName(
  automation: Automation | undefined,
  integrationId: string
) {
  return automation?.socialIntegrations.find(
    (integration) => integration.integration_id === integrationId
  )?.name
}

function automationForIntegration(
  automationById: Map<string, Automation>,
  integrationId: string
) {
  if (!integrationId) return undefined
  return [...automationById.values()].find((automation) =>
    automation.socialIntegrations.some(
      (integration) => integration.integration_id === integrationId
    )
  )
}

function automationTimezone(automation: Automation | undefined) {
  return automation?.schedule?.timezone || automation?.timezone || "UTC"
}

function expectedGenerationAt(
  automation: Automation | undefined,
  publishedAt: string,
  xThreads = false
) {
  const leadMinutes =
    xThreads || automation?.automationKind === "x_threads"
      ? 0
      : slideshowGenerationLeadMinutes({
          posting_mode: automation?.postingMode,
          generation_lead_minutes: automation?.generationLeadMinutes,
        })
  return generationExpectedAt(publishedAt, leadMinutes)
}

function localPostTitle(status: PostFastPostRecord["status"]) {
  if (status === "awaiting_manual_post") return "Manual post due"
  if (status === "ready_for_review") return "Post needs review"
  if (status === "failed") return "Publish failed"
  return "Draft post"
}

function automationLink(automationId: string) {
  return `/?view=automations&automation=${encodeURIComponent(automationId)}`
}

function contentLink(automationId: string, runId: string) {
  return `${automationLink(automationId)}&run=${encodeURIComponent(runId)}`
}

function calendarFilters(searchParams: URLSearchParams): CalendarFilters {
  return {
    accounts: filterSet(searchParams, "accounts"),
    platforms: filterSet(searchParams, "platforms", true),
    statuses: filterSet(searchParams, "statuses"),
    automations: filterSet(searchParams, "automations"),
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
