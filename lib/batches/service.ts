/**
 * Batches: mass-produce carousel posts from one template.
 *
 * Text is written outside the app (agents call `/api/v1/batches` or MCP); the
 * app validates, renders and schedules:
 *
 *   plan (validate every item + compute publish slots, all-or-nothing)
 *     → create batch row → `batch-start` job
 *     → one render row + `render-slideshow` job per item
 *     → render succeeded → post row (publishAt = the item's slot)
 *     → `publish-post` job uploads slides and creates the SocialBu post with
 *       `publish_at` (SocialBu schedules natively)
 *     → batch refresh (counts, status, "batch finished" notification).
 *
 * Per-item progress lives on the render and post rows (`batchId`,
 * `batchIndex`), so concurrent workers never rewrite a shared items array. The
 * batch row keeps the immutable input plus a refreshed `counts`/`results`
 * snapshot; reads recompute it live. Every step is idempotent (deterministic
 * idempotency keys, intent keys and job dedupe keys), so a crash is recovered
 * by the worker sweep or `retryBatch`.
 */
import { DateTime } from "luxon"
import { z } from "zod"

import {
  BATCH_FINISHED_STATUSES,
  DataNotFoundError,
  deterministicJobId,
  getRepositories,
  sha256Hex,
  type Batch,
  type BatchCounts,
  type BatchItem,
  type BatchItemResult,
  type BatchItemStatus,
  type BatchScheduleConfig,
  type BatchStatus,
  type BatchSummary,
  type Post,
  type RenderSource,
  type RenderSummary,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"
import { emitNotification } from "@/lib/notifications"
import {
  getPublisher,
  PUBLISHER_NOT_CONNECTED_MESSAGE,
  PublisherNotConfiguredError,
  type Publisher,
  type PublisherAccount,
} from "@/lib/publishing/publisher"
import {
  buildPlatformOptions,
  cancelPost,
  listPublishingAccounts,
  PROVIDER_LIMITS,
  PublishingInputError,
} from "@/lib/publishing/service"
import {
  canonicalJson,
  OUTPUT_FORMATS,
  resolveTemplate,
  seededIndex,
  SpecError,
  validateSpec,
  type OutputFormat,
  type SlideshowSpec,
  type SlotDef,
  type SlotValues,
} from "@/lib/render/spec"
import {
  enqueueRenderJob,
  loadTemplateSpec,
  renderHashFor,
} from "@/lib/renders/service"

import { BATCH_CANCELED_MESSAGE } from "./constants"
import { csvToItems, type RawBatchItem } from "./csv"
import {
  computeSchedule,
  normalizeScheduleConfig,
  ScheduleError,
  type BatchIssue,
  type OccupiedSlot,
} from "./schedule"

export type { BatchIssue }

export const MAX_BATCH_ITEMS = 200
export { BATCH_CANCELED_MESSAGE }
export const BATCH_NOT_CONNECTED_MESSAGE = `${PUBLISHER_NOT_CONNECTED_MESSAGE}: the slides rendered, but no post was scheduled. Connect SocialBu (SOCIALBU_API_TOKEN), then retry the batch.`
/** A slot this far in the past is still "now" (clock skew). */
const SLOT_TOLERANCE_MS = 60_000
const ACCOUNT_CACHE_MS = 60_000
const DEFAULT_CAPTION_LIMIT = PROVIDER_LIMITS.tiktok?.maxCaption ?? 4000
const DEFAULT_MEDIA_LIMIT = PROVIDER_LIMITS.tiktok?.maxMedia ?? 35

export type BatchDeps = {
  repos?: Repositories
  publisher?: Publisher
  now?: () => Date
}
type Resolved = { repos: Repositories; publisher: Publisher; now: () => Date }

function resolveDeps(deps: BatchDeps = {}): Resolved {
  return {
    repos: deps.repos ?? getRepositories(),
    publisher: deps.publisher ?? getPublisher(),
    now: deps.now ?? (() => new Date()),
  }
}

/** A request problem: `errors` (batch-level) and `itemErrors` carry JSON pointers. */
export class BatchRequestError extends Error {
  readonly status: number
  readonly errors: BatchIssue[]
  readonly warnings: BatchIssue[]
  readonly plan: BatchPlan | null
  constructor(
    status: number,
    message: string,
    errors: BatchIssue[] = [],
    warnings: BatchIssue[] = [],
    plan: BatchPlan | null = null
  ) {
    super(message)
    this.name = "BatchRequestError"
    this.status = status
    this.errors = errors
    this.warnings = warnings
    this.plan = plan
  }
}

// ─────────────────────────────── request shape ───────────────────────────────

const PlatformOptionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown())
)

export const BatchItemInputSchema = z.strictObject({
  slotValues: z.record(z.string(), z.unknown()).optional(),
  /** Alias of `slotValues`. */
  slots: z.record(z.string(), z.unknown()).optional(),
  caption: z.string().max(5000).optional(),
  title: z.string().max(512).optional(),
  /** Seeds this item's random collection picks. */
  seed: z.string().max(128).optional(),
  /** SocialBu options per provider, e.g. `{ "tiktok": { "auto_add_music": true } }`. */
  platformOptions: PlatformOptionsSchema.optional(),
})
export type BatchItemInput = z.input<typeof BatchItemInputSchema>

export const BatchRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(255).optional(),
  /** XOR `spec`: a stored template id or a starter id (`starter-…`). */
  templateId: z.string().min(1).max(64).optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
  /** XOR `csv`. */
  items: z.array(z.unknown()).optional(),
  /** CSV text: one row per item (see lib/batches/csv.ts). */
  csv: z.string().optional(),
  /** CSV column → slot path (`hook`, `slides.0.caption`), `caption`, `title`, `seed`, `platformOptions`, or null to ignore. */
  mapping: z.record(z.string(), z.string().nullable()).optional(),
  schedule: z.unknown(),
  output: z
    .strictObject({
      format: z.enum(OUTPUT_FORMATS).optional(),
      scale: z.number().min(0.5).max(2).optional(),
    })
    .optional(),
  /** Seeds random picks and jitter (default: derived from the request). */
  seed: z.string().min(1).max(128).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
})
export type BatchRequest = z.input<typeof BatchRequestSchema>

// ─────────────────────────────── planning ───────────────────────────────

export type PlannedItem = {
  index: number
  accountId: string | null
  publishAt: string | null
  localTime: string | null
  slideCount: number | null
  caption: string
  title: string | null
  seed: string | null
  slotValues: SlotValues
  boundSlotValues: SlotValues
  platformOptions: Record<string, Record<string, unknown>>
  errors: BatchIssue[]
}

export type BatchPlan = {
  ok: boolean
  /** Batch-level problems (template, schedule, accounts, CSV). */
  errors: BatchIssue[]
  warnings: BatchIssue[]
  name: string
  templateId: string | null
  spec: SlideshowSpec | null
  schedule: BatchScheduleConfig | null
  output: { format: OutputFormat; scale: number }
  seed: string
  publisher: { connected: boolean }
  items: PlannedItem[]
  /** Every error, batch-level and per item. */
  errorCount: number
}

type CollectionLookup = (
  ref: string
) => Promise<{ id: string; mediaIds: string[] } | null>

function collectionLookup(
  repos: Repositories,
  workspaceId: WorkspaceId
): CollectionLookup {
  const cache = new Map<
    string,
    Promise<{ id: string; mediaIds: string[] } | null>
  >()
  return (ref) => {
    let hit = cache.get(ref)
    if (!hit) {
      hit = (async () => {
        const collection =
          (await repos.collections.get(workspaceId, ref)) ??
          (await repos.collections.getByName(workspaceId, ref))
        if (!collection || collection.deletedAt) return null
        return {
          id: collection.id,
          mediaIds: await repos.media.listIdsInCollection(
            workspaceId,
            collection.id
          ),
        }
      })()
      cache.set(ref, hit)
    }
    return hit
  }
}

type ImageVisit = {
  path: (string | number)[]
  value: unknown
  set: (next: unknown) => void
}

/** Visits every image slot value (top-level and list item fields). */
function visitImages(
  slots: Record<string, SlotDef> | undefined,
  values: SlotValues,
  visit: (v: ImageVisit) => void
) {
  for (const [name, def] of Object.entries(slots ?? {})) {
    if (def.type === "image" && values[name] !== undefined) {
      visit({
        path: [name],
        value: values[name],
        set: (next) => (values[name] = next),
      })
    } else if (def.type === "list" && Array.isArray(values[name])) {
      ;(values[name] as unknown[]).forEach((entry, i) => {
        if (!entry || typeof entry !== "object") return
        const item = entry as Record<string, unknown>
        for (const [field, fdef] of Object.entries(def.item)) {
          if (fdef.type === "image" && item[field] !== undefined) {
            visit({
              path: [name, i, field],
              value: item[field],
              set: (next) => (item[field] = next),
            })
          }
        }
      })
    }
  }
}

function isRandomCollectionSource(
  value: unknown
): value is { collection: string; pick: "random"; seed?: string } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { collection?: unknown }).collection === "string" &&
    (value as { pick?: unknown }).pick === "random"
  )
}

/**
 * Replaces `{collection, pick: "random"}` sources with `{media}` so no image
 * repeats within the batch while the collection still has unused images
 * (then it starts over). Deterministic for a given seed.
 */
async function bindRandomPicks(
  slots: Record<string, SlotDef> | undefined,
  values: SlotValues,
  options: {
    lookup: CollectionLookup
    used: Map<string, Set<string>>
    seed: string
  }
): Promise<SlotValues> {
  const bound = structuredClone(values)
  const pending: ImageVisit[] = []
  visitImages(slots, bound, (visit) => {
    if (isRandomCollectionSource(visit.value)) pending.push(visit)
  })
  for (const visit of pending) {
    const source = visit.value as { collection: string; seed?: string }
    const collection = await options.lookup(source.collection)
    // Missing/empty collections are reported by resolveTemplate.
    if (!collection || collection.mediaIds.length === 0) continue
    let used = options.used.get(collection.id)
    if (!used) options.used.set(collection.id, (used = new Set()))
    let candidates = collection.mediaIds.filter((id) => !used!.has(id))
    if (candidates.length === 0) {
      used.clear()
      candidates = collection.mediaIds
    }
    const pick =
      candidates[
        seededIndex(
          `${options.seed}:${source.seed ?? ""}:${visit.path.join("/")}`,
          candidates.length
        )
      ]!
    used.add(pick)
    visit.set({ media: pick })
  }
  return bound
}

function mediaIdsIn(
  slots: Record<string, SlotDef> | undefined,
  values: SlotValues
): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = []
  visitImages(slots, values, ({ path, value }) => {
    const media =
      value && typeof value === "object"
        ? (value as { media?: unknown }).media
        : undefined
    if (typeof media === "string")
      out.push({ id: media, path: `/slotValues/${path.join("/")}` })
  })
  return out
}

function zodIssues(
  error: z.ZodError,
  base: string,
  prefix = "schema"
): BatchIssue[] {
  return error.issues.map((issue) => ({
    code: `${prefix}.${issue.code}`,
    path: `${base}${issue.path.length ? "/" + issue.path.map(String).join("/") : ""}`,
    message: issue.message,
  }))
}

function defaultSeed(request: BatchRequest): string {
  return sha256Hex(
    canonicalJson({
      templateId: request.templateId ?? null,
      spec: request.spec ?? null,
      items: request.items ?? null,
      csv: request.csv ?? null,
      schedule: request.schedule ?? null,
    })
  ).slice(0, 24)
}

/** Posts that occupy an account's calendar (scheduled or done, not failed/canceled). */
async function occupiedSlots(
  repos: Repositories,
  workspaceId: WorkspaceId,
  accountIds: readonly string[],
  range: { from: Date; to: Date },
  excludePostIds: ReadonlySet<string> = new Set()
): Promise<OccupiedSlot[]> {
  const accounts = new Set(accountIds)
  const posts = await repos.posts.listRange(workspaceId, {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  })
  return posts.flatMap((post) => {
    if (!accounts.has(post.accountId) || excludePostIds.has(post.id)) return []
    if (post.status === "failed" || post.status === "canceled") return []
    const at = post.publishedAt ?? post.publishAt
    return at ? [{ accountId: post.accountId, at }] : []
  })
}

const accountCache = new WeakMap<
  Publisher,
  Map<
    string,
    { at: number; accounts: (PublisherAccount & { disabled: boolean })[] }
  >
>()

async function workspaceAccounts(
  workspaceId: WorkspaceId,
  deps: Resolved
): Promise<(PublisherAccount & { disabled: boolean })[]> {
  let byWorkspace = accountCache.get(deps.publisher)
  if (!byWorkspace) accountCache.set(deps.publisher, (byWorkspace = new Map()))
  const hit = byWorkspace.get(workspaceId)
  const t = deps.now().getTime()
  if (hit && t - hit.at < ACCOUNT_CACHE_MS) return hit.accounts
  const { accounts } = await listPublishingAccounts(workspaceId, {
    repos: deps.repos,
    publisher: deps.publisher,
  })
  byWorkspace.set(workspaceId, { at: t, accounts })
  return accounts
}

/** Options a batch post sends to SocialBu for `account` (item options win over batch options). */
export function batchPlatformOptions(
  batch: Pick<Batch, "schedule" | "mode">,
  item: Pick<BatchItem, "platformOptions">,
  provider: string
): Record<string, unknown> {
  const options: Record<string, unknown> = {}
  if (provider === "tiktok") {
    if (batch.schedule.privacyStatus)
      options.privacy_status = batch.schedule.privacyStatus
    if (batch.mode === "draft") options.upload_as_draft_to_tiktok = true
  }
  return { ...options, ...(item.platformOptions[provider] ?? {}) }
}

/**
 * Validates a batch request and computes its schedule without writing
 * anything. All-or-nothing: `ok` is false when any item or the batch has an
 * error.
 */
export async function planBatch(
  workspaceId: WorkspaceId,
  input: unknown,
  deps: BatchDeps = {}
): Promise<BatchPlan> {
  const resolved = resolveDeps(deps)
  const { repos, publisher, now } = resolved
  const errors: BatchIssue[] = []
  const warnings: BatchIssue[] = []
  const empty = (seed: string): BatchPlan => ({
    ok: false,
    errors,
    warnings,
    name: "",
    templateId: null,
    spec: null,
    schedule: null,
    output: { format: "png", scale: 1 },
    seed,
    publisher: { connected: publisher.configured },
    items: [],
    errorCount: errors.length,
  })

  const parsed = BatchRequestSchema.safeParse(input)
  if (!parsed.success) {
    errors.push(...zodIssues(parsed.error, ""))
    return empty("")
  }
  const request = parsed.data
  const seed = request.seed ?? request.idempotencyKey ?? defaultSeed(request)

  // Template
  let spec: SlideshowSpec | null = null
  let templateId: string | null = null
  let templateName: string | null = null
  if (!!request.templateId === !!request.spec) {
    errors.push({
      code: "batch.template",
      path: "/templateId",
      message: "Give exactly one of templateId or spec.",
    })
  } else if (request.templateId) {
    const template = await loadTemplateSpec(
      repos,
      workspaceId,
      request.templateId
    )
    if (!template) {
      errors.push({
        code: "batch.template_not_found",
        path: "/templateId",
        message: `Template ${request.templateId} was not found.`,
      })
    } else {
      spec = template.spec
      templateId = template.id
      templateName = template.name
    }
  } else {
    const validation = validateSpec(request.spec)
    if (!validation.ok || !validation.spec) {
      errors.push(
        ...validation.errors.map((e) => ({
          code: e.code,
          path: `/spec${e.path}`,
          message: e.message,
        }))
      )
    } else {
      spec = validation.spec
      templateName = spec.name ?? null
    }
  }

  // Items
  let rawItems: unknown[] = []
  if (!!request.items === (request.csv !== undefined)) {
    errors.push({
      code: "batch.items",
      path: "/items",
      message: "Give exactly one of items (JSON) or csv.",
    })
  } else if (request.items) {
    rawItems = request.items
  } else if (spec) {
    const fromCsv = csvToItems(request.csv ?? "", {
      slots: spec.slots,
      mapping: request.mapping,
    })
    errors.push(...fromCsv.errors)
    rawItems = fromCsv.items
  }
  if (request.mapping && request.csv === undefined) {
    errors.push({
      code: "batch.mapping",
      path: "/mapping",
      message: "mapping only applies to csv.",
    })
  }
  if (
    !errors.some(
      (e) => e.path.startsWith("/items") || e.path.startsWith("/csv")
    )
  ) {
    if (rawItems.length === 0)
      errors.push({
        code: "batch.items_empty",
        path: "/items",
        message: "Add at least one item.",
      })
    if (rawItems.length > MAX_BATCH_ITEMS) {
      errors.push({
        code: "batch.items_limit",
        path: "/items",
        message: `A batch holds at most ${MAX_BATCH_ITEMS} items.`,
      })
    }
  }

  // Schedule
  const settings = await repos.settings.get(workspaceId)
  const normalized = normalizeScheduleConfig(request.schedule, {
    defaultTimezone: settings.timezone,
    now: now(),
  })
  const schedule = normalized.ok ? normalized.config : null
  if (!normalized.ok) errors.push(...normalized.errors)

  // Accounts
  let accounts: Map<string, PublisherAccount & { disabled: boolean }> | null =
    null
  if (schedule) {
    if (!publisher.configured) {
      warnings.push({
        code: "publisher.not_connected",
        path: "/schedule/accountIds",
        message: `${PUBLISHER_NOT_CONNECTED_MESSAGE}: accounts cannot be checked, and every item will fail at the scheduling step until SocialBu is connected.`,
      })
    } else {
      accounts = new Map(
        (await workspaceAccounts(workspaceId, resolved)).map((a) => [a.id, a])
      )
      schedule.accountIds.forEach((id, k) => {
        const account = accounts!.get(id)
        const path = `/schedule/accountIds/${k}`
        if (!account || account.disabled) {
          errors.push({
            code: "batch.account_unknown",
            path,
            message: `SocialBu account ${id} is not available.`,
          })
        } else if (!account.active) {
          errors.push({
            code: "batch.account_inactive",
            path,
            message: `${account.name} is disconnected in SocialBu.`,
          })
        } else if (schedule.mode === "draft" && account.provider !== "tiktok") {
          errors.push({
            code: "batch.draft_provider",
            path,
            message: `Draft mode uploads to TikTok drafts; ${account.name} is ${account.provider}.`,
          })
        } else if (account.provider === "tiktok" && schedule.privacyStatus) {
          try {
            buildPlatformOptions(account, {
              privacy_status: schedule.privacyStatus,
            })
          } catch (error) {
            errors.push({
              code: "batch.privacy",
              path: "/schedule/privacyStatus",
              message: (error as Error).message,
            })
          }
        }
      })
    }
  }

  // Per item: shape, collection picks, full resolve (slide count), media, limits.
  const lookup = collectionLookup(repos, workspaceId)
  const used = new Map<string, Set<string>>()
  const items: PlannedItem[] = []
  for (const [index, raw] of rawItems.slice(0, MAX_BATCH_ITEMS).entries()) {
    const base =
      request.csv !== undefined ? `/csv/rows/${index + 1}` : `/items/${index}`
    const itemErrors: BatchIssue[] = []
    const parsedItem = BatchItemInputSchema.safeParse(raw)
    const item: RawBatchItem = parsedItem.success
      ? {
          slotValues: parsedItem.data.slotValues ?? parsedItem.data.slots ?? {},
          caption: parsedItem.data.caption,
          title: parsedItem.data.title,
          seed: parsedItem.data.seed,
          platformOptions: parsedItem.data.platformOptions,
        }
      : { slotValues: {} }
    if (!parsedItem.success)
      itemErrors.push(...zodIssues(parsedItem.error, base))
    if (
      parsedItem.success &&
      parsedItem.data.slotValues &&
      parsedItem.data.slots
    ) {
      itemErrors.push({
        code: "batch.item_slots",
        path: `${base}/slots`,
        message: "Give slotValues or slots, not both.",
      })
    }
    const platformOptions = PlatformOptionsSchema.safeParse(
      item.platformOptions ?? {}
    )
    if (!platformOptions.success)
      itemErrors.push(
        ...zodIssues(platformOptions.error, `${base}/platformOptions`)
      )
    const planned: PlannedItem = {
      index,
      accountId: null,
      publishAt: null,
      localTime: null,
      slideCount: null,
      caption: item.caption ?? "",
      title: item.title ?? null,
      seed: item.seed ?? null,
      slotValues: item.slotValues,
      boundSlotValues: item.slotValues,
      platformOptions: platformOptions.success ? platformOptions.data : {},
      errors: itemErrors,
    }
    if (spec && parsedItem.success) {
      const itemSeed = `${seed}:${index}:${item.seed ?? ""}`
      planned.boundSlotValues = await bindRandomPicks(
        spec.slots,
        item.slotValues,
        { lookup, used, seed: itemSeed }
      )
      try {
        const resolvedSpec = await resolveTemplate(
          spec,
          planned.boundSlotValues,
          {
            resolveCollection: async (ref) =>
              (await lookup(ref))?.mediaIds ?? null,
            seed: itemSeed,
          }
        )
        planned.slideCount = resolvedSpec.slides.length
      } catch (error) {
        if (!(error instanceof SpecError)) throw error
        itemErrors.push(
          ...error.errors.map((e) => ({
            code: e.code,
            path: `${base}${e.path}`,
            message: e.message,
          }))
        )
      }
    }
    items.push(planned)
  }

  // Media ids must exist (one batched lookup).
  if (spec) {
    const refs = items.flatMap((item) =>
      mediaIdsIn(spec!.slots, item.boundSlotValues).map((ref) => ({
        item,
        ...ref,
      }))
    )
    const ids = [...new Set(refs.map((r) => r.id))]
    const found = new Set<string>()
    for (let i = 0; i < ids.length; i += 100) {
      for (const media of await repos.media.getMany(
        workspaceId,
        ids.slice(i, i + 100)
      ))
        found.add(media.id)
    }
    for (const ref of refs) {
      if (!found.has(ref.id)) {
        const base =
          request.csv !== undefined
            ? `/csv/rows/${ref.item.index + 1}`
            : `/items/${ref.item.index}`
        ref.item.errors.push({
          code: "asset.not_found",
          path: `${base}${ref.path}`,
          message: `Media ${ref.id} does not exist.`,
        })
      }
    }
  }

  // Schedule slots (only when everything else is sound).
  if (schedule && items.length) {
    const t = now()
    try {
      const horizonDays =
        Math.ceil(
          items.length /
            (schedule.accountIds.length *
              Math.min(
                schedule.maxPerAccountPerDay,
                schedule.timesOfDay.length
              ))
        ) + 14
      const from = DateTime.fromISO(schedule.startDate, {
        zone: schedule.timezone,
      })
        .minus({ days: 1 })
        .toJSDate()
      const to = new Date(
        Math.max(t.getTime(), from.getTime()) +
          Math.min(400, horizonDays * 3) * 86_400_000
      )
      let occupied = schedule.skipOccupied
        ? await occupiedSlots(repos, workspaceId, schedule.accountIds, {
            from,
            to,
          })
        : []
      let slots = computeSchedule({
        itemCount: items.length,
        config: schedule,
        occupied,
        now: t,
        seed,
      })
      const last = Math.max(...slots.map((s) => Date.parse(s.publishAt)))
      if (schedule.skipOccupied && last >= to.getTime()) {
        occupied = await occupiedSlots(
          repos,
          workspaceId,
          schedule.accountIds,
          { from, to: new Date(t.getTime() + 400 * 86_400_000) }
        )
        slots = computeSchedule({
          itemCount: items.length,
          config: schedule,
          occupied,
          now: t,
          seed,
        })
      }
      for (const slot of slots) {
        const item = items[slot.index]!
        item.accountId = slot.accountId
        item.publishAt = slot.publishAt
        item.localTime = slot.localTime
      }
    } catch (error) {
      if (!(error instanceof ScheduleError)) throw error
      errors.push({
        code: "schedule.capacity",
        path: "/schedule",
        message: error.message,
      })
    }
  }

  // Network limits (exact when the account is known, TikTok limits otherwise).
  for (const item of items) {
    const base =
      request.csv !== undefined
        ? `/csv/rows/${item.index + 1}`
        : `/items/${item.index}`
    const account = item.accountId ? accounts?.get(item.accountId) : undefined
    const limits = account
      ? PROVIDER_LIMITS[account.provider]
      : { maxCaption: DEFAULT_CAPTION_LIMIT, maxMedia: DEFAULT_MEDIA_LIMIT }
    if (limits?.maxCaption && item.caption.length > limits.maxCaption) {
      item.errors.push({
        code: "batch.caption_length",
        path: `${base}/caption`,
        message: `Captions are limited to ${limits.maxCaption} characters${account ? ` for ${account.name}` : ""}.`,
      })
    }
    if (
      limits?.maxMedia &&
      item.slideCount !== null &&
      item.slideCount > limits.maxMedia
    ) {
      item.errors.push({
        code: "batch.slide_count",
        path: base,
        message: `This item renders ${item.slideCount} slides; ${account?.name ?? "TikTok"} accepts at most ${limits.maxMedia}.`,
      })
    }
    if (account?.provider === "tiktok") {
      try {
        buildPlatformOptions(
          account,
          batchPlatformOptions(
            { schedule: schedule!, mode: schedule!.mode },
            item,
            "tiktok"
          )
        )
      } catch (error) {
        if (!(error instanceof PublishingInputError)) throw error
        item.errors.push({
          code: "batch.privacy",
          path: `${base}/platformOptions/tiktok`,
          message: error.message,
        })
      }
    }
  }

  const errorCount =
    errors.length + items.reduce((n, item) => n + item.errors.length, 0)
  const output = {
    format: request.output?.format ?? "png",
    scale: request.output?.scale ?? 1,
  }
  const startLabel = schedule
    ? DateTime.fromISO(schedule.startDate).toFormat("LLL d")
    : ""
  return {
    ok: errorCount === 0,
    errors,
    warnings,
    name:
      request.name ??
      [templateName ?? "Batch", startLabel].filter(Boolean).join(" · "),
    templateId,
    spec,
    schedule,
    output,
    seed,
    publisher: { connected: publisher.configured },
    items,
    errorCount,
  }
}

// ─────────────────────────────── create + start ───────────────────────────────

export type CreateBatchContext = {
  source: RenderSource
  createdBy: string
  apiKeyId?: string | null
}

export type CreateBatchResult = {
  batch: Batch
  created: boolean
  plan: BatchPlan
}

/** Validates (all-or-nothing), stores the batch and enqueues its `batch-start` job. */
export async function createBatch(
  workspaceId: WorkspaceId,
  input: unknown,
  context: CreateBatchContext,
  deps: BatchDeps = {}
): Promise<CreateBatchResult> {
  const resolved = resolveDeps(deps)
  const plan = await planBatch(workspaceId, input, resolved)
  if (!plan.ok || !plan.spec || !plan.schedule) {
    throw new BatchRequestError(
      422,
      `The batch has ${plan.errorCount} error${plan.errorCount === 1 ? "" : "s"}.`,
      plan.errors,
      plan.warnings,
      plan
    )
  }
  const idempotencyKey =
    (input as { idempotencyKey?: string }).idempotencyKey ?? null
  const { value: batch, created } = await resolved.repos.batches.create(
    workspaceId,
    {
      name: plan.name,
      mode: plan.schedule.mode,
      templateId: plan.templateId,
      spec: plan.spec,
      schedule: plan.schedule,
      output: plan.output,
      items: plan.items.map((item): BatchItem => ({
        slotValues: item.slotValues,
        boundSlotValues: item.boundSlotValues,
        caption: item.caption,
        platformOptions: item.platformOptions,
        seed: item.seed,
        title: item.title,
        accountId: item.accountId!,
        publishAt: item.publishAt!,
        localTime: item.localTime!,
        slideCount: item.slideCount ?? 0,
      })),
      source: context.source,
      apiKeyId: context.apiKeyId ?? null,
      idempotencyKey,
      createdBy: context.createdBy,
    }
  )
  if (created) await enqueueBatchStart(resolved.repos, workspaceId, batch.id, 0)
  return { batch, created, plan }
}

async function enqueueBatchStart(
  repos: Repositories,
  workspaceId: WorkspaceId,
  batchId: string,
  retryCount: number
) {
  const { value } = await repos.jobs.enqueue({
    workspaceId,
    type: "batch-start",
    payload: { batchId },
    dedupeKey: `batch-start:${batchId}:${retryCount}`,
  })
  return value
}

const renderKey = (batchId: string, index: number, attempt: number) =>
  `batch:${batchId}:${index}:${attempt}`
const attemptOf = (render: Pick<RenderSummary, "idempotencyKey">) =>
  Number(/:(\d+)$/.exec(render.idempotencyKey ?? "")?.[1] ?? 0)

/** The newest render attempt per item index. */
function currentRenders(
  renders: readonly RenderSummary[]
): Map<number, RenderSummary> {
  const byIndex = new Map<number, RenderSummary>()
  for (const render of renders) {
    if (render.batchIndex === null) continue
    const current = byIndex.get(render.batchIndex)
    if (!current || attemptOf(render) > attemptOf(current))
      byIndex.set(render.batchIndex, render)
  }
  return byIndex
}

function postsByIndex(posts: readonly Post[]): Map<number, Post> {
  const byIndex = new Map<number, Post>()
  for (const post of posts)
    if (post.batchIndex !== null) byIndex.set(post.batchIndex, post)
  return byIndex
}

/** Records render attempt `attempt` for item `index` and enqueues its job. */
async function createItemRender(
  repos: Repositories,
  batch: Batch,
  index: number,
  attempt: number,
  lookup: CollectionLookup
): Promise<{ ok: true } | { ok: false; error: string }> {
  const item = batch.items[index]!
  try {
    const resolved = await resolveTemplate(batch.spec, item.boundSlotValues, {
      resolveCollection: async (ref) => (await lookup(ref))?.mediaIds ?? null,
      seed: `${batch.id}:${index}:${item.seed ?? ""}`,
    })
    const { value: render } = await repos.renders.create(batch.workspaceId, {
      templateId: batch.templateId,
      slotValues: item.boundSlotValues,
      spec: resolved,
      source: "batch",
      apiKeyId: batch.apiKeyId,
      idempotencyKey: renderKey(batch.id, index, attempt),
      title: item.title ?? `${batch.name} · ${index + 1}`,
      format: batch.output.format,
      scale: batch.output.scale,
      renderHash: renderHashFor(resolved, batch.output),
      batchId: batch.id,
      batchIndex: index,
      createdBy: batch.createdBy,
    })
    if (render.status === "queued")
      await enqueueRenderJob(repos, batch.workspaceId, render.id)
    return { ok: true }
  } catch (error) {
    if (error instanceof SpecError) return { ok: false, error: error.message }
    throw error
  }
}

/**
 * `batch-start` job: creates the missing render (and render job) of every
 * item. Idempotent: items that already have a render are skipped.
 */
export async function startBatch(
  workspaceId: WorkspaceId,
  batchId: string,
  deps: BatchDeps = {}
) {
  const resolved = resolveDeps(deps)
  const { repos } = resolved
  const batch = await repos.batches.get(workspaceId, batchId)
  if (!batch) return { batchId, status: "missing" as const, created: 0 }
  if (batch.canceledAt)
    return { batchId, status: "canceled" as const, created: 0 }
  const existing = currentRenders(
    await repos.renders.listByBatch(workspaceId, batchId)
  )
  const lookup = collectionLookup(repos, workspaceId)
  const itemErrors = { ...batch.itemErrors }
  let created = 0
  for (let index = 0; index < batch.items.length; index++) {
    if (existing.has(index) || itemErrors[index]) continue
    const result = await createItemRender(repos, batch, index, 0, lookup)
    if (result.ok) created++
    else itemErrors[index] = result.error
  }
  if (Object.keys(itemErrors).length !== Object.keys(batch.itemErrors).length) {
    await repos.batches.update(workspaceId, batchId, { itemErrors })
  }
  const view = await refreshBatch(workspaceId, batchId, resolved)
  return { batchId, status: view?.status ?? "missing", created }
}

// ─────────────────────────────── posts ───────────────────────────────

async function itemSlot(
  batch: Batch,
  index: number,
  accountId: string,
  excludePostId: string | null,
  deps: Resolved
): Promise<{ publishAt: string } | { error: string }> {
  const item = batch.items[index]!
  const t = deps.now()
  if (Date.parse(item.publishAt) >= t.getTime() - SLOT_TOLERANCE_MS)
    return { publishAt: item.publishAt }
  // The slot passed (slow render, retry): take the account's next free slot on the same grid.
  const today = DateTime.fromJSDate(t, {
    zone: batch.schedule.timezone,
  }).toISODate()!
  const config = {
    ...batch.schedule,
    startDate:
      today > batch.schedule.startDate ? today : batch.schedule.startDate,
  }
  const occupied = await occupiedSlots(
    deps.repos,
    batch.workspaceId,
    [accountId],
    {
      from: new Date(t.getTime() - 86_400_000),
      to: new Date(t.getTime() + 400 * 86_400_000),
    },
    excludePostId ? new Set([excludePostId]) : new Set()
  )
  try {
    const [slot] = computeSchedule({
      itemCount: 1,
      config,
      occupied,
      now: t,
      seed: `${batch.id}:${index}:resched:${batch.retryCount}`,
      accountForItem: () => accountId,
    })
    return { publishAt: slot!.publishAt }
  } catch (error) {
    if (error instanceof ScheduleError) return { error: error.message }
    throw error
  }
}

/**
 * Creates the post of a rendered item (publishAt = its slot) and enqueues the
 * SocialBu submission. Idempotent per item (intent key). With `retry`, a
 * failed post is reset and resubmitted. Without SocialBu the post is recorded
 * as failed with a clear message instead of retrying forever.
 */
export async function ensureItemPost(
  batch: Batch,
  index: number,
  renderId: string,
  deps: BatchDeps & { existing?: Post | null; retry?: boolean } = {}
): Promise<Post | null> {
  const resolved = resolveDeps(deps)
  const { repos, publisher } = resolved
  const workspaceId = batch.workspaceId
  const item = batch.items[index]
  if (!item || batch.canceledAt) return null
  const existing =
    deps.existing !== undefined
      ? deps.existing
      : ((await repos.posts.listByBatch(workspaceId, batch.id)).find(
          (p) => p.batchIndex === index
        ) ?? null)
  if (existing && !(deps.retry && existing.status === "failed")) return existing

  let failure: string | null = null
  let provider = existing?.provider ?? "unknown"
  let options: Record<string, unknown> = {}
  if (!publisher.configured) {
    failure = BATCH_NOT_CONNECTED_MESSAGE
  } else {
    const account = (await workspaceAccounts(workspaceId, resolved)).find(
      (a) => a.id === item.accountId
    )
    if (!account || account.disabled)
      failure = `SocialBu account ${item.accountId} is not available.`
    else if (!account.active)
      failure = `${account.name} is disconnected in SocialBu. Reconnect it, then retry the batch.`
    else {
      provider = account.provider
      try {
        options = buildPlatformOptions(
          account,
          batchPlatformOptions(batch, item, provider)
        )
      } catch (error) {
        if (!(error instanceof PublishingInputError)) throw error
        failure = error.message
      }
    }
  }
  let publishAt = existing?.publishAt ?? item.publishAt
  if (!failure) {
    const slot = await itemSlot(
      batch,
      index,
      item.accountId,
      existing?.id ?? null,
      resolved
    )
    if ("error" in slot) failure = slot.error
    else publishAt = slot.publishAt
  }

  let post: Post
  if (existing) {
    post = await repos.posts.update(workspaceId, existing.id, {
      status: failure ? "failed" : "scheduled",
      provider,
      publishAt,
      platformOptions: options,
      providerPostId: null,
      error: failure,
    })
  } else {
    const { value, created } = await repos.posts.upsertIntent(workspaceId, {
      renderId,
      provider,
      accountId: item.accountId,
      status: "scheduled",
      publishAt,
      caption: item.caption,
      platformOptions: options,
      intentKey: `batch:${batch.id}:${index}`,
      batchId: batch.id,
      batchIndex: index,
      createdBy: batch.createdBy,
    })
    if (!created) return value
    post = failure
      ? await repos.posts.update(workspaceId, value.id, {
          status: "failed",
          error: failure,
        })
      : value
  }
  if (!failure) {
    await repos.jobs.enqueue({
      workspaceId,
      type: "publish-post",
      payload: { postId: post.id },
      dedupeKey: `batch-submit:${post.id}:${batch.retryCount}`,
    })
  }
  return post
}

/** Render-job hook: a settled batch render advances its item. */
export async function onBatchRenderSettled(
  workspaceId: WorkspaceId,
  renderId: string,
  deps: BatchDeps = {}
) {
  const resolved = resolveDeps(deps)
  const render = await resolved.repos.renders.get(workspaceId, renderId)
  if (!render?.batchId || render.batchIndex === null) return null
  const batch = await resolved.repos.batches.get(workspaceId, render.batchId)
  if (!batch) return null
  if (render.status === "succeeded" && !batch.canceledAt) {
    const current = currentRenders(
      await resolved.repos.renders.listByBatch(workspaceId, batch.id)
    ).get(render.batchIndex)
    if (current?.id === render.id)
      await ensureItemPost(batch, render.batchIndex, render.id, resolved)
  }
  return refreshBatch(workspaceId, batch.id, resolved)
}

// ─────────────────────────────── state ───────────────────────────────

export type BatchItemState = BatchItemResult & {
  render: RenderSummary | null
  post: Post | null
}

export type BatchState = {
  status: BatchStatus
  counts: BatchCounts
  items: BatchItemState[]
}

function itemStatus(
  batch: Pick<Batch, "canceledAt">,
  render: RenderSummary | null,
  post: Post | null,
  itemError?: string
) {
  if (post) {
    switch (post.status) {
      case "published":
        return { status: "published" as const, error: null }
      case "failed":
        return {
          status: "failed" as const,
          error: post.error ?? "SocialBu could not publish the post.",
        }
      case "canceled":
        return { status: "canceled" as const, error: null }
      default:
        return {
          status: post.providerPostId
            ? ("scheduled" as const)
            : ("scheduling" as const),
          error: post.error,
        }
    }
  }
  if (render) {
    if (render.status === "succeeded")
      return {
        status: batch.canceledAt
          ? ("canceled" as const)
          : ("rendered" as const),
        error: null,
      }
    if (render.status === "failed") {
      return render.error === BATCH_CANCELED_MESSAGE
        ? { status: "canceled" as const, error: null }
        : {
            status: "failed" as const,
            error: render.error ?? "The render failed.",
          }
    }
    return { status: "rendering" as const, error: null }
  }
  if (itemError) return { status: "failed" as const, error: itemError }
  return {
    status: batch.canceledAt ? ("canceled" as const) : ("pending" as const),
    error: null,
  }
}

const TERMINAL_ITEM: readonly BatchItemStatus[] = [
  "scheduled",
  "published",
  "failed",
  "canceled",
]

/** Pure: item results, counts and batch status from the batch's renders and posts. */
export function deriveBatchState(
  batch: Pick<Batch, "items" | "itemErrors" | "canceledAt">,
  renders: readonly RenderSummary[],
  posts: readonly Post[]
): BatchState {
  const renderOf = currentRenders(renders)
  const postOf = postsByIndex(posts)
  const counts: BatchCounts = {
    total: batch.items.length,
    queued: 0,
    rendered: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
    canceled: 0,
  }
  let started = false
  const items = batch.items.map((item, index): BatchItemState => {
    const render = renderOf.get(index) ?? null
    const post = postOf.get(index) ?? null
    const { status, error } = itemStatus(
      batch,
      render,
      post,
      batch.itemErrors[index]
    )
    if (render || post || batch.itemErrors[index]) started = true
    if (status === "pending" || status === "rendering") counts.queued++
    if (render?.status === "succeeded") counts.rendered++
    if (status === "scheduled") counts.scheduled++
    if (status === "published") counts.published++
    if (status === "failed") counts.failed++
    if (status === "canceled") counts.canceled++
    return {
      index,
      status,
      renderId: render?.id ?? null,
      postId: post?.id ?? null,
      accountId: post?.accountId ?? item.accountId,
      publishAt: post?.publishAt ?? item.publishAt,
      providerPostId: post?.providerPostId ?? null,
      error,
      render,
      post,
    }
  })
  let status: BatchStatus
  if (batch.canceledAt) status = "canceled"
  else if (!started) status = "queued"
  else if (items.some((item) => !TERMINAL_ITEM.includes(item.status)))
    status = "running"
  else if (counts.failed === counts.total) status = "failed"
  else if (counts.failed > 0) status = "completed_with_errors"
  else status = "completed"
  return { status, counts, items }
}

export type BatchDetail = { batch: Batch; state: BatchState }

function resultsOf(state: BatchState): BatchItemResult[] {
  return state.items.map(({ render: _r, post: _p, ...result }) => result)
}

/**
 * Recomputes the batch's status/counts/results from its renders and posts,
 * stores the snapshot when it changed, and sends the "batch finished"
 * notification on the transition to a finished status.
 */
export async function refreshBatch(
  workspaceId: WorkspaceId,
  batchId: string,
  deps: BatchDeps = {}
): Promise<(BatchDetail & { status: BatchStatus }) | null> {
  const resolved = resolveDeps(deps)
  const { repos, now } = resolved
  let batch = await repos.batches.get(workspaceId, batchId)
  if (!batch) return null
  const [renders, posts] = await Promise.all([
    repos.renders.listByBatch(workspaceId, batchId),
    repos.posts.listByBatch(workspaceId, batchId),
  ])
  const state = deriveBatchState(batch, renders, posts)
  const results = resultsOf(state)
  const finished = BATCH_FINISHED_STATUSES.includes(state.status)
  const changed =
    batch.status !== state.status ||
    canonicalJson(batch.counts) !== canonicalJson(state.counts) ||
    canonicalJson(batch.results) !== canonicalJson(results)
  if (changed) {
    const before = batch.status
    batch = await repos.batches.update(workspaceId, batchId, {
      status: state.status,
      counts: state.counts,
      results,
      completedAt: finished ? (batch.completedAt ?? now().toISOString()) : null,
    })
    if (
      finished &&
      state.status !== "canceled" &&
      !BATCH_FINISHED_STATUSES.includes(before)
    ) {
      await notifyBatchFinished(batch, state, resolved).catch(() => undefined)
    }
  }
  return { batch, state, status: state.status }
}

export function batchSummaryText(
  counts: BatchCounts,
  mode: Batch["mode"]
): string {
  const parts = [
    counts.scheduled
      ? `${counts.scheduled} ${mode === "draft" ? "scheduled to TikTok drafts" : "scheduled"}`
      : null,
    counts.published ? `${counts.published} published` : null,
    counts.failed ? `${counts.failed} failed` : null,
    counts.canceled ? `${counts.canceled} canceled` : null,
  ].filter(Boolean)
  return parts.length
    ? `${parts.join(" · ")} of ${counts.total}.`
    : `${counts.total} items.`
}

async function notifyBatchFinished(
  batch: Batch,
  state: BatchState,
  deps: Resolved
) {
  const failedOnly = state.status === "failed"
  const firstError = state.items.find((item) => item.status === "failed")?.error
  await emitNotification(
    batch.workspaceId,
    {
      event: "batch.finished",
      title: failedOnly
        ? `Batch "${batch.name}" failed`
        : `Batch "${batch.name}" finished`,
      body: `${batchSummaryText(state.counts, batch.mode)}${firstError ? ` First error: ${firstError}` : ""}`.slice(
        0,
        1000
      ),
      dedupeKey: `batch:${batch.id}:finished:${batch.retryCount}`,
    },
    { repos: deps.repos, now: deps.now }
  )
}

export async function getBatchDetail(
  workspaceId: WorkspaceId,
  batchId: string,
  deps: BatchDeps = {}
): Promise<BatchDetail> {
  const detail = await refreshBatch(workspaceId, batchId, deps)
  if (!detail) throw new DataNotFoundError("batch", batchId)
  return detail
}

// ─────────────────────────────── retry + cancel ───────────────────────────────

export type RetryBatchResult = {
  batch: Batch
  state: BatchState
  retried: number[]
  skipped: { index: number; reason: string }[]
}

/**
 * Retries every failed item (new render attempt for render failures, a fresh
 * SocialBu submission for post failures) and resumes items that stalled
 * (no render yet, or rendered without a post). Canceled batches stay canceled.
 */
export async function retryBatch(
  workspaceId: WorkspaceId,
  batchId: string,
  deps: BatchDeps = {}
): Promise<RetryBatchResult> {
  const resolved = resolveDeps(deps)
  const { repos, publisher } = resolved
  const batch = await repos.batches.get(workspaceId, batchId)
  if (!batch) throw new DataNotFoundError("batch", batchId)
  if (batch.canceledAt)
    throw new BatchRequestError(409, "Canceled batches cannot be retried.")
  const [renders, posts] = await Promise.all([
    repos.renders.listByBatch(workspaceId, batchId),
    repos.posts.listByBatch(workspaceId, batchId),
  ])
  const allRenders = renders
  const state = deriveBatchState(batch, renders, posts)
  const retried: number[] = []
  const skipped: { index: number; reason: string }[] = []
  const itemErrors = { ...batch.itemErrors }
  const next: Batch = { ...batch, retryCount: batch.retryCount + 1 }
  const lookup = collectionLookup(repos, workspaceId)

  for (const item of state.items) {
    const { index, render, post } = item
    if (post?.status === "failed") {
      if (!publisher.configured) {
        skipped.push({ index, reason: BATCH_NOT_CONNECTED_MESSAGE })
        continue
      }
      await ensureItemPost(next, index, post.renderId, {
        ...resolved,
        existing: post,
        retry: true,
      })
      retried.push(index)
    } else if (
      !post &&
      render?.status === "failed" &&
      item.status === "failed"
    ) {
      const attempt =
        Math.max(
          ...allRenders.filter((r) => r.batchIndex === index).map(attemptOf)
        ) + 1
      const result = await createItemRender(repos, next, index, attempt, lookup)
      if (result.ok) retried.push(index)
      else {
        itemErrors[index] = result.error
        skipped.push({ index, reason: result.error })
      }
    } else if (!render && !post) {
      delete itemErrors[index]
      const result = await createItemRender(
        repos,
        { ...next, itemErrors },
        index,
        0,
        lookup
      )
      if (result.ok) retried.push(index)
      else {
        itemErrors[index] = result.error
        skipped.push({ index, reason: result.error })
      }
    } else if (!post && render?.status === "succeeded") {
      await ensureItemPost(next, index, render.id, {
        ...resolved,
        existing: null,
      })
      retried.push(index)
    }
  }
  if (
    retried.length ||
    canonicalJson(itemErrors) !== canonicalJson(batch.itemErrors)
  ) {
    await repos.batches.update(workspaceId, batchId, {
      retryCount: next.retryCount,
      itemErrors,
      ...(retried.length
        ? { status: "running" as const, completedAt: null }
        : {}),
    })
  }
  const detail = (await refreshBatch(workspaceId, batchId, resolved))!
  return { batch: detail.batch, state: detail.state, retried, skipped }
}

export type CancelBatchResult = {
  batch: Batch
  state: BatchState
  /** Items stopped by this call (queued renders, local or SocialBu-scheduled posts). */
  canceled: number[]
  /** Items that could not be stopped (already published/publishing). */
  kept: { index: number; reason: string }[]
  /** SocialBu deletes that failed; those posts may still publish. */
  failures: { index: number; postId: string; error: string }[]
}

/**
 * Cancels the batch: queued render jobs are canceled, not-yet-published
 * SocialBu posts are deleted (`DELETE /posts/{id}`), and nothing new starts.
 * Published or publishing items are reported, never touched.
 */
export async function cancelBatch(
  workspaceId: WorkspaceId,
  batchId: string,
  deps: BatchDeps = {}
): Promise<CancelBatchResult> {
  const resolved = resolveDeps(deps)
  const { repos, publisher } = resolved
  const batch = await repos.batches.get(workspaceId, batchId)
  if (!batch) throw new DataNotFoundError("batch", batchId)
  const canceledAt = batch.canceledAt ?? resolved.now().toISOString()
  if (!batch.canceledAt)
    await repos.batches.update(workspaceId, batchId, {
      canceledAt,
      status: "canceled",
    })
  await repos.jobs.cancel(
    workspaceId,
    deterministicJobId(
      workspaceId,
      `batch-start:${batchId}:${batch.retryCount}`
    ),
    BATCH_CANCELED_MESSAGE
  )

  const [renders, posts] = await Promise.all([
    repos.renders.listByBatch(workspaceId, batchId),
    repos.posts.listByBatch(workspaceId, batchId),
  ])
  const state = deriveBatchState({ ...batch, canceledAt: null }, renders, posts)
  const canceled: number[] = []
  const kept: { index: number; reason: string }[] = []
  const failures: { index: number; postId: string; error: string }[] = []
  for (const item of state.items) {
    const { index, render, post } = item
    if (post) {
      if (post.status === "canceled" || post.status === "failed") continue
      if (post.status === "published") {
        kept.push({ index, reason: "Already published." })
        continue
      }
      if (post.status === "publishing") {
        kept.push({ index, reason: "SocialBu is publishing it now." })
        continue
      }
      if (post.providerPostId && !publisher.configured) {
        failures.push({
          index,
          postId: post.id,
          error: `${PUBLISHER_NOT_CONNECTED_MESSAGE}; delete SocialBu post ${post.providerPostId} there.`,
        })
        continue
      }
      try {
        await cancelPost(workspaceId, post.id, {
          repos,
          publisher,
          now: resolved.now,
        })
        canceled.push(index)
      } catch (error) {
        if (error instanceof PublisherNotConfiguredError) {
          failures.push({
            index,
            postId: post.id,
            error: PUBLISHER_NOT_CONNECTED_MESSAGE,
          })
        } else {
          failures.push({
            index,
            postId: post.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      continue
    }
    if (
      render &&
      (render.status === "queued" || render.status === "rendering")
    ) {
      await repos.jobs.cancel(
        workspaceId,
        deterministicJobId(workspaceId, `render:${render.id}`),
        BATCH_CANCELED_MESSAGE
      )
      // A render already in progress finishes, but no post is created for it.
      if (render.status === "queued")
        await repos.renders.markFailed(
          workspaceId,
          render.id,
          BATCH_CANCELED_MESSAGE
        )
      canceled.push(index)
    } else if (!render || render.status === "succeeded") {
      if (!render && batch.itemErrors[index]) continue
      canceled.push(index)
    }
  }
  const detail = (await refreshBatch(workspaceId, batchId, resolved))!
  return { batch: detail.batch, state: detail.state, canceled, kept, failures }
}

// ─────────────────────────────── worker sweep ───────────────────────────────

/** Batches older than this are no longer swept (bounds reads for anything stuck). */
export const BATCH_SWEEP_WINDOW_MS = 7 * 24 * 3_600_000

/**
 * Worker sweep: advances batches that stalled (a crash between a render and
 * its post, a lost hook) and refreshes their snapshot. Cheap per batch: two
 * list queries plus at most one update.
 */
export async function sweepActiveBatches(
  deps: BatchDeps & { limit?: number } = {}
): Promise<number> {
  const resolved = resolveDeps(deps)
  const { repos } = resolved
  let advanced = 0
  const createdAfter = new Date(
    resolved.now().getTime() - BATCH_SWEEP_WINDOW_MS
  ).toISOString()
  for (const summary of await repos.batches.listActive(deps.limit ?? 20, {
    createdAfter,
  })) {
    const batch = await repos.batches.get(summary.workspaceId, summary.id)
    if (!batch || batch.canceledAt) continue
    const [renders, posts] = await Promise.all([
      repos.renders.listByBatch(batch.workspaceId, batch.id),
      repos.posts.listByBatch(batch.workspaceId, batch.id),
    ])
    const state = deriveBatchState(batch, renders, posts)
    for (const item of state.items) {
      if (item.status === "rendered" && item.render) {
        await ensureItemPost(batch, item.index, item.render.id, {
          ...resolved,
          existing: null,
        })
      }
    }
    // Never started (batch-start lost): enqueue it again (deduped per retry count).
    if (state.status === "queued")
      await enqueueBatchStart(
        repos,
        batch.workspaceId,
        batch.id,
        batch.retryCount
      )
    await refreshBatch(batch.workspaceId, batch.id, resolved)
    advanced++
  }
  return advanced
}

// ─────────────────────────────── views ───────────────────────────────

export function batchSummaryView(batch: BatchSummary) {
  return {
    id: batch.id,
    name: batch.name,
    status: batch.status,
    mode: batch.mode,
    templateId: batch.templateId,
    itemCount: batch.itemCount,
    counts: batch.counts,
    accountIds: batch.schedule.accountIds ?? [],
    timezone: batch.schedule.timezone ?? null,
    source: batch.source,
    retryCount: batch.retryCount,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    completedAt: batch.completedAt,
    canceledAt: batch.canceledAt,
  }
}
export type BatchSummaryView = ReturnType<typeof batchSummaryView>

/** Full batch view; slide URLs point at the ownership-checked render routes under `apiBaseUrl`. */
export function batchDetailView(detail: BatchDetail, apiBaseUrl: string) {
  const { batch, state } = detail
  const base = apiBaseUrl.replace(/\/$/, "")
  return {
    ...batchSummaryView({
      ...batch,
      status: state.status,
      counts: state.counts,
    }),
    schedule: batch.schedule,
    output: batch.output,
    items: state.items.map((result) => {
      const item = batch.items[result.index]!
      const slides = [...(result.render?.output?.slides ?? [])].sort(
        (a, b) => a.index - b.index
      )
      return {
        index: result.index,
        status: result.status,
        error: result.error,
        caption: item.caption,
        title: item.title,
        accountId: result.accountId,
        publishAt: result.publishAt,
        /** The planned local slot; `publishAt` differs when the slot passed and the item moved. */
        plannedLocalTime: item.localTime,
        rescheduled: result.publishAt !== item.publishAt,
        slideCount: result.render?.slideCount ?? item.slideCount,
        slotValues: item.slotValues,
        render: result.render
          ? {
              id: result.render.id,
              status: result.render.status,
              error: result.render.error,
              coverUrl: slides[0]
                ? `${base}/renders/${result.render.id}/slides/${slides[0].index}`
                : null,
              slides: slides.map((slide) => ({
                index: slide.index,
                url: `${base}/renders/${result.render!.id}/slides/${slide.index}`,
                width: slide.width,
                height: slide.height,
              })),
            }
          : null,
        post: result.post
          ? {
              id: result.post.id,
              status: result.post.status,
              provider: result.post.provider,
              providerPostId: result.post.providerPostId,
              permalink: result.post.permalink,
              error: result.post.error,
            }
          : null,
      }
    }),
  }
}
export type BatchDetailView = ReturnType<typeof batchDetailView>

/** Preview response body (no writes). */
export function batchPlanView(plan: BatchPlan) {
  return {
    ok: plan.ok,
    errors: plan.errors,
    warnings: plan.warnings,
    errorCount: plan.errorCount,
    name: plan.name,
    templateId: plan.templateId,
    publisher: plan.publisher,
    schedule: plan.schedule,
    items: plan.items.map((item) => ({
      index: item.index,
      accountId: item.accountId,
      publishAt: item.publishAt,
      localTime: item.localTime,
      slideCount: item.slideCount,
      caption: item.caption,
      title: item.title,
      errors: item.errors,
    })),
  }
}
export type BatchPlanView = ReturnType<typeof batchPlanView>
