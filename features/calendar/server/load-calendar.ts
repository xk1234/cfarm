import "server-only"

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
import { clean, isRecord } from "@/lib/guards"
import { postfastRequest } from "@/lib/postfast-client"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import { listPublicationRecordsForRead } from "@/lib/post-repository"
import type { Automation } from "@/lib/realfarm-data"
import { listResultRecords, type ResultRecord } from "@/lib/results"
import {
  xAutomationToAutomation,
  type XAutomationRun,
} from "@/lib/x-automation"
import { listXAutomationRuns, listXAutomations } from "@/lib/x-automation-store"

import {
  calendarItemMatchesFilters,
  calendarLifecycleForLocalPost,
  calendarLifecycleForPostFast,
  dedupeCalendarItems,
  summarizeCalendarItems,
  type CalendarItem,
  type CalendarLifecycleStatus,
  type CalendarPayload,
  type CalendarQueryFilters,
  type CalendarTarget,
} from "@/features/calendar/domain/calendar"

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

export type CalendarRangeResult =
  { ok: true; from: Date; to: Date } | { ok: false; error: string }

const maximumCalendarRangeMs = 370 * 24 * 60 * 60 * 1_000

export function parseCalendarRange(
  searchParams: URLSearchParams,
  now = new Date()
): CalendarRangeResult {
  const parsedFrom = validDate(searchParams.get("from"))
  const parsedTo = validDate(searchParams.get("to"))
  if (
    (searchParams.has("from") && !parsedFrom) ||
    (searchParams.has("to") && !parsedTo)
  ) {
    return { ok: false, error: "from and to must be valid ISO dates" }
  }
  const from = parsedFrom ?? startOfMonth(now)
  const to = parsedTo ?? endOfMonth(now)
  if (to < from) return { ok: false, error: "to must be after from" }
  if (to.getTime() - from.getTime() > maximumCalendarRangeMs) {
    return { ok: false, error: "Calendar ranges cannot exceed 370 days" }
  }
  return { ok: true, from, to }
}

export async function loadCalendar(input: {
  from: Date
  to: Date
  now?: Date
  filters?: CalendarQueryFilters
}): Promise<CalendarPayload> {
  const [automationRecords, xAutomations, runs, xRuns, results, localPosts] =
    await Promise.all([
      listAutomationRecords(),
      listXAutomations(),
      listAutomationRuns({ limit: 500 }),
      listXAutomationRuns(),
      listResultRecords({ limit: 500 }),
      listPublicationRecordsForRead({ surface: "calendar" }),
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

  const remoteItems = await remoteCalendarItems({
    from: input.from,
    to: input.to,
    localByPostFastId,
    runContexts,
    automationById,
  }).catch(() => [])
  const mergedItems = dedupeCalendarItems([
    ...projectionItems(
      automations,
      input.from,
      input.to,
      input.now ?? new Date()
    ),
    ...localPosts.flatMap((post) =>
      localPostCalendarItem(
        post,
        runContexts,
        automationById,
        input.from,
        input.to
      )
    ),
    ...remoteItems,
  ])
  const items = input.filters
    ? mergedItems.filter((item) =>
        calendarItemMatchesFilters(item, input.filters ?? {})
      )
    : mergedItems

  return {
    items,
    summary: summarizeCalendarItems(items),
    range: { from: input.from.toISOString(), to: input.to.toISOString() },
  }
}

export function calendarQueryFilters(
  searchParams: URLSearchParams
): CalendarQueryFilters {
  return {
    accounts: filterSet(searchParams, "accounts"),
    platforms: filterSet(searchParams, "platforms", true),
    statuses: filterSet(searchParams, "statuses"),
    automations: filterSet(searchParams, "templates"),
    sourceTypes: filterSet(searchParams, "sourceType"),
  }
}

function projectionItems(
  automations: Automation[],
  from: Date,
  to: Date,
  now: Date
) {
  return automations.flatMap((automation) => {
    if (automation.status !== "live" || automation.schedule?.paused === true) {
      return []
    }
    return automationSlotsInRange(automation, from, to).flatMap<CalendarItem>(
      (slot) =>
        Date.parse(slot.scheduledFor) < now.getTime()
          ? []
          : [
              {
                id: `planned:${slot.automationId}:${slot.scheduledFor}`,
                status: "planned",
                datetime: slot.scheduledFor,
                slot: slot.scheduledFor,
                timezone: slot.timezone,
                automationId: slot.automationId,
                automationName: slot.automationName,
                targets: automationTargets(automation, "planned"),
                source: "projection",
                sourceType: "automation",
                sourceId: slot.automationId,
                title: "Planned content slot",
                links: { automation: automationLink(slot.automationId) },
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
    )
  })
}

function localPostCalendarItem(
  post: PostFastPostRecord,
  runContexts: Map<string, RunContext>,
  automationById: Map<string, Automation>,
  from: Date,
  to: Date
): CalendarItem[] {
  const status = calendarLifecycleForLocalPost(post.status)
  if (!status || (status === "published" && post.postfastPostId)) return []
  const context = runContexts.get(post.sourceId)
  const automationId =
    context?.automationId ||
    (automationById.has(post.sourceId) ? post.sourceId : undefined)
  const automation = automationId ? automationById.get(automationId) : undefined
  const datetime =
    status === "published"
      ? clean(post.publishedAt) ||
        context?.slot ||
        clean(post.scheduledAt || post.createdAt)
      : context?.slot || clean(post.scheduledAt || post.createdAt)
  if (!inRange(datetime, from, to)) return []
  return [
    {
      id: `local:${post.id}`,
      status,
      datetime,
      slot: context?.slot || post.scheduledAt,
      timezone: automationTimezone(automation),
      automationId,
      automationName: automation?.name,
      targets: [postTarget(post, status, automation)],
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
          ? contentLink(automation, automationId, post.sourceId)
          : undefined,
        live: clean(post.releaseUrl),
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
    return [
      {
        id: `postfast:${postId || index}`,
        status,
        datetime,
        slot: context?.slot || scheduledAt || undefined,
        timezone: automationTimezone(targetAutomation),
        automationId,
        automationName: automation?.name,
        targets: [
          {
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
          },
        ],
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
              ? contentLink(automation, automationId, local.sourceId)
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
  if (status === "published") return "Published post"
  return "Draft post"
}

function automationLink(automationId: string) {
  return `/app/templates?template=${encodeURIComponent(automationId)}`
}

function contentLink(
  automation: Automation | undefined,
  automationId: string,
  runId: string
) {
  if (automation?.automationKind === "ugc") {
    return `/app/ugc/${encodeURIComponent(runId)}`
  }
  if (
    automation?.automationKind === "x_threads" ||
    automation?.automationKind === "video"
  ) {
    return automationLink(automationId)
  }
  return `${automationLink(automationId)}&run=${encodeURIComponent(runId)}`
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

function validDate(value: string | null) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:?\d{2}))?$/.test(value)
  ) {
    return null
  }
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
