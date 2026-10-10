/**
 * `/api/v1/batches`: mass-produce carousel posts (lib/batches/service.ts).
 * Registered on the public API app by lib/openapi-app.ts; the in-app UI calls
 * the same routes with the Clerk session.
 */
import {
  createRoute,
  z,
  type OpenAPIHono,
  type RouteConfig,
} from "@hono/zod-openapi"
import type { Context, Env } from "hono"

import type { ApiPrincipal } from "@/lib/api-keys"
import {
  batchDetailView,
  batchPlanView,
  batchSummaryView,
  cancelBatch,
  createBatch,
  getBatchDetail,
  planBatch,
  retryBatch,
} from "@/lib/batches/service"
import { BATCH_STATUSES, type Repositories } from "@/lib/data"
import type { Publisher } from "@/lib/publishing/publisher"

type BatchEnv = Env & { Variables: { principal: ApiPrincipal } }

export type BatchRouteContext = {
  repos: () => Repositories
  publisher: () => Publisher
  now: () => Date
  apiBaseUrl: (c: Context) => string
  /** Called after jobs were enqueued (wakes the worker / drains inline in local e2e). */
  kickJobs: (repos: Repositories) => void
}

const AnyObject = z.record(z.string(), z.unknown())
const HHMM = z
  .string()
  .openapi({ example: "09:00", description: '24-hour local time "HH:MM".' })

const BatchIssueSchema = z
  .object({
    code: z.string(),
    path: z
      .string()
      .openapi({ description: "RFC 6901 JSON Pointer into the request" }),
    message: z.string(),
  })
  .openapi("BatchIssue")

export const BatchScheduleSchema = z
  .object({
    accountIds: z
      .array(z.string())
      .openapi({
        description:
          "SocialBu account ids (GET /accounts). Items are dealt round-robin.",
      }),
    timezone: z
      .string()
      .optional()
      .openapi({
        description:
          "IANA zone, e.g. America/New_York. Default: workspace timezone.",
        example: "America/New_York",
      }),
    startDate: z
      .string()
      .optional()
      .openapi({
        description: "YYYY-MM-DD in timezone. Default: today.",
        example: "2026-10-12",
      }),
    timesOfDay: z
      .array(HHMM)
      .optional()
      .openapi({
        description:
          'Daily local slots. Default ["09:00","13:00","19:00"]. XOR postsPerDay.',
      }),
    postsPerDay: z
      .number()
      .int()
      .optional()
      .openapi({
        description: "Evenly spaced slots inside window (default 09:00–21:00).",
      }),
    window: z.object({ start: HHMM, end: HHMM }).optional(),
    maxPerAccountPerDay: z
      .number()
      .int()
      .optional()
      .openapi({ description: "Default 3; existing posts count toward it." }),
    skipOccupied: z
      .boolean()
      .optional()
      .openapi({
        description:
          "Default true: avoid the account's existing scheduled posts.",
      }),
    minGapMinutes: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          "Default 30: minimum spacing between posts of one account.",
      }),
    jitterMinutes: z
      .union([
        z.number().int(),
        z.object({ min: z.number().int(), max: z.number().int() }),
      ])
      .optional()
      .openapi({
        description:
          "Deterministic offset per slot. Default {min:0,max:10}; a number n means 0..n.",
      }),
    minLeadMinutes: z
      .number()
      .int()
      .optional()
      .openapi({ description: "Default 15: no slot sooner than now + this." }),
    mode: z
      .enum(["schedule", "draft"])
      .optional()
      .openapi({
        description:
          '"draft" uploads to TikTok drafts (upload_as_draft_to_tiktok) at the slot.',
      }),
    privacyStatus: z
      .string()
      .optional()
      .openapi({
        description: "TikTok privacy_status override; default public.",
      }),
  })
  .openapi("BatchSchedule")

const BatchItemSchema = z
  .object({
    slotValues: AnyObject.optional().openapi({
      description: "Template slot values (alias: slots).",
    }),
    caption: z.string().optional(),
    title: z.string().optional(),
    seed: z.string().optional(),
    platformOptions: AnyObject.optional().openapi({
      description:
        'Per-provider SocialBu options, e.g. {"tiktok":{"auto_add_music":true}}.',
    }),
  })
  .openapi("BatchItemInput")

export const BatchRequestBodySchema = z
  .looseObject({
    name: z.string().optional(),
    templateId: z
      .string()
      .optional()
      .openapi({ description: "Stored or starter template id. XOR spec." }),
    spec: AnyObject.optional(),
    items: z
      .array(BatchItemSchema)
      .optional()
      .openapi({ description: "One entry per carousel (max 200). XOR csv." }),
    csv: z
      .string()
      .optional()
      .openapi({
        description:
          "CSV with a header row; columns map to slots (`hook`, `slides.0.caption`, `slides.0.image`), `caption`, `title`, `seed`, `platformOptions`. " +
          "Image cells: https URL, `media:<id>`, `collection:<name>` (random, not reused within the batch).",
      }),
    mapping: z
      .record(z.string(), z.string().nullable())
      .optional()
      .openapi({
        description: "CSV column → target path (null ignores the column).",
      }),
    schedule: BatchScheduleSchema,
    output: z
      .object({
        format: z.enum(["png", "jpeg", "webp"]).optional(),
        scale: z.number().optional(),
      })
      .optional(),
    seed: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
  .openapi("BatchRequest")

const CountsSchema = z
  .object({
    total: z.number().int(),
    queued: z.number().int(),
    rendered: z.number().int(),
    scheduled: z.number().int(),
    published: z.number().int(),
    failed: z.number().int(),
    canceled: z.number().int(),
  })
  .openapi("BatchCounts")

const BatchSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(BATCH_STATUSES),
    mode: z.enum(["schedule", "draft"]),
    templateId: z.string().nullable(),
    itemCount: z.number().int(),
    counts: CountsSchema,
    accountIds: z.array(z.string()),
    timezone: z.string().nullable(),
    source: z.string(),
    retryCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
    canceledAt: z.string().nullable(),
  })
  .openapi("BatchSummary")

const BatchItemViewSchema = z
  .looseObject({
    index: z.number().int(),
    status: z.enum([
      "pending",
      "rendering",
      "rendered",
      "scheduling",
      "scheduled",
      "published",
      "failed",
      "canceled",
    ]),
    error: z.string().nullable(),
    caption: z.string(),
    accountId: z.string(),
    publishAt: z.string(),
    plannedLocalTime: z.string(),
    rescheduled: z.boolean(),
    slideCount: z.number().int(),
    render: z
      .looseObject({
        id: z.string(),
        status: z.string(),
        coverUrl: z.string().nullable(),
        slides: z.array(AnyObject),
      })
      .nullable(),
    post: z
      .looseObject({
        id: z.string(),
        status: z.string(),
        providerPostId: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("BatchItem")

const BatchSchema = BatchSummarySchema.extend({
  schedule: AnyObject,
  output: AnyObject,
  items: z.array(BatchItemViewSchema),
}).openapi("Batch")

const PreviewSchema = z
  .object({
    ok: z.boolean(),
    errors: z.array(BatchIssueSchema),
    warnings: z.array(BatchIssueSchema),
    errorCount: z.number().int(),
    name: z.string(),
    templateId: z.string().nullable(),
    publisher: z.object({ connected: z.boolean() }),
    schedule: AnyObject.nullable(),
    items: z.array(
      z.object({
        index: z.number().int(),
        accountId: z.string().nullable(),
        publishAt: z.string().nullable(),
        localTime: z.string().nullable(),
        slideCount: z.number().int().nullable(),
        caption: z.string(),
        title: z.string().nullable(),
        errors: z.array(BatchIssueSchema),
      })
    ),
  })
  .openapi("BatchPreview")

const BatchValidationErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.string(),
    errors: z.array(BatchIssueSchema),
    warnings: z.array(BatchIssueSchema),
    preview: PreviewSchema.optional(),
  })
  .openapi("BatchValidationError")
const ErrorSchema = z.object({ error: z.string(), code: z.string().optional() })

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})
const authResponses = {
  401: { description: "Missing or invalid credentials." },
  403: { description: "The API key lacks the required scope." },
  429: { description: "Rate limited; see Retry-After." },
} as const
const bearer = [{ bearerAuth: [] }]
const route = <R extends RouteConfig>(config: R): R => createRoute(config)

const requestBody = {
  required: false,
  description:
    "application/json (BatchRequest), or multipart/form-data with `file` (CSV) and `payload` (the rest of the BatchRequest as JSON).",
  content: { "application/json": { schema: BatchRequestBodySchema } },
}

const previewRoute = route({
  method: "post",
  path: "/batches/preview",
  tags: ["Batches"],
  summary:
    "Validate a batch and compute its publish schedule without creating anything",
  security: bearer,
  request: { body: requestBody },
  responses: {
    200: json(
      z.object({ preview: PreviewSchema }),
      "Validation result (ok=false lists every error) and the computed slots."
    ),
    ...authResponses,
  },
})

const createBatchRoute = route({
  method: "post",
  path: "/batches",
  tags: ["Batches"],
  summary:
    "Create a batch: validate all items, render each, schedule each on SocialBu at its slot",
  description:
    "All-or-nothing: any invalid item rejects the whole batch with 422 and per-item JSON pointers. " +
    "On success the batch renders in the background and each item becomes a SocialBu post with publish_at = its slot. " +
    "A repeated idempotencyKey returns the existing batch with 200.",
  security: bearer,
  request: { body: requestBody },
  responses: {
    200: json(
      z.object({ batch: BatchSchema }),
      "Existing batch for this idempotency key."
    ),
    201: json(
      z.object({ batch: BatchSchema, warnings: z.array(BatchIssueSchema) }),
      "Created; rendering starts in the background."
    ),
    422: json(
      BatchValidationErrorSchema,
      "Invalid batch (nothing was created)."
    ),
    ...authResponses,
  },
})

const listBatchesRoute = route({
  method: "get",
  path: "/batches",
  tags: ["Batches"],
  summary: "List batches, newest first",
  security: bearer,
  request: {
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      status: z.enum(BATCH_STATUSES).optional(),
    }),
  },
  responses: {
    200: json(
      z.object({
        batches: z.array(BatchSummarySchema),
        nextCursor: z.string().nullable(),
      }),
      "Batches."
    ),
    ...authResponses,
  },
})

const BatchIdParams = z.object({ id: z.string().min(1) })

const getBatchRoute = route({
  method: "get",
  path: "/batches/{id}",
  tags: ["Batches"],
  summary:
    "Get a batch with live per-item status, slide URLs and SocialBu post ids",
  security: bearer,
  request: { params: BatchIdParams },
  responses: {
    200: json(z.object({ batch: BatchSchema }), "Batch."),
    404: json(ErrorSchema, "Unknown batch."),
    ...authResponses,
  },
})

const retryBatchRoute = route({
  method: "post",
  path: "/batches/{id}/retry",
  tags: ["Batches"],
  summary:
    "Retry failed items (new render attempt or a fresh SocialBu submission) and resume stalled ones",
  security: bearer,
  request: { params: BatchIdParams },
  responses: {
    200: json(
      z.object({
        batch: BatchSchema,
        retried: z.array(z.number().int()),
        skipped: z.array(
          z.object({ index: z.number().int(), reason: z.string() })
        ),
      }),
      "Retried item indexes."
    ),
    404: json(ErrorSchema, "Unknown batch."),
    409: json(ErrorSchema, "The batch was canceled."),
    ...authResponses,
  },
})

const cancelBatchRoute = route({
  method: "post",
  path: "/batches/{id}/cancel",
  tags: ["Batches"],
  summary:
    "Cancel a batch: stop queued renders and delete not-yet-published SocialBu posts",
  security: bearer,
  request: { params: BatchIdParams },
  responses: {
    200: json(
      z.object({
        batch: BatchSchema,
        canceled: z.array(z.number().int()),
        kept: z.array(
          z.object({ index: z.number().int(), reason: z.string() })
        ),
        failures: z.array(
          z.object({
            index: z.number().int(),
            postId: z.string(),
            error: z.string(),
          })
        ),
      }),
      "Canceled items; `kept` were already published/publishing, `failures` could not be deleted on SocialBu."
    ),
    404: json(ErrorSchema, "Unknown batch."),
    ...authResponses,
  },
})

/** JSON body, or multipart `file` (CSV) + `payload` (JSON). */
async function readBatchBody(c: Context): Promise<unknown> {
  const contentType = c.req.header("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.raw.formData().catch(() => null)
    if (!form) return null
    const payloadField = form.get("payload")
    let payload: Record<string, unknown> = {}
    if (typeof payloadField === "string" && payloadField.trim()) {
      try {
        const parsed = JSON.parse(payloadField)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          payload = parsed
        else return { __invalid: "payload must be a JSON object" }
      } catch {
        return { __invalid: "payload is not valid JSON" }
      }
    }
    const file = form.get("file")
    if (file instanceof Blob) payload.csv = await file.text()
    return payload
  }
  return c.req.json().catch(() => null)
}

function invalidBody(c: Context, body: unknown) {
  if (body && typeof body === "object" && !("__invalid" in body)) return null
  const message =
    (body as { __invalid?: string } | null)?.__invalid ??
    "Send a JSON body (BatchRequest)."
  return c.json(
    {
      ok: false,
      error: message,
      errors: [{ code: "batch.body", path: "", message }],
      warnings: [],
    },
    422
  )
}

export function registerBatchRoutes<E extends BatchEnv>(
  app: OpenAPIHono<E>,
  ctx: BatchRouteContext
) {
  const deps = () => ({
    repos: ctx.repos(),
    publisher: ctx.publisher(),
    now: ctx.now,
  })
  const principalOf = (c: Context<E>) => c.get("principal") as ApiPrincipal

  app.openapi(previewRoute, async (c) => {
    const body = await readBatchBody(c)
    const invalid = invalidBody(c, body)
    if (invalid) return invalid as never
    const plan = await planBatch(principalOf(c).workspaceId, body, deps())
    return c.json({ preview: batchPlanView(plan) }, 200)
  })

  app.openapi(createBatchRoute, async (c) => {
    const principal = principalOf(c)
    const body = await readBatchBody(c)
    const invalid = invalidBody(c, body)
    if (invalid) return invalid as never
    const d = deps()
    const result = await createBatch(
      principal.workspaceId,
      body,
      {
        source: principal.kind === "api_key" ? "api" : "ui",
        createdBy: principal.actor,
        apiKeyId: principal.apiKeyId,
      },
      d
    )
    if (result.created) ctx.kickJobs(d.repos)
    const detail = await getBatchDetail(
      principal.workspaceId,
      result.batch.id,
      d
    )
    const view = batchDetailView(detail, ctx.apiBaseUrl(c))
    if (!result.created) return c.json({ batch: view }, 200)
    return c.json({ batch: view, warnings: result.plan.warnings }, 201)
  })

  app.openapi(listBatchesRoute, async (c) => {
    const { cursor, limit, status } = c.req.valid("query")
    const page = await ctx
      .repos()
      .batches.list(principalOf(c).workspaceId, { cursor, limit, status })
    return c.json(
      {
        batches: page.items.map(batchSummaryView),
        nextCursor: page.nextCursor,
      },
      200
    )
  })

  app.openapi(getBatchRoute, async (c) => {
    const { id } = c.req.valid("param")
    const detail = await getBatchDetail(principalOf(c).workspaceId, id, deps())
    return c.json({ batch: batchDetailView(detail, ctx.apiBaseUrl(c)) }, 200)
  })

  app.openapi(retryBatchRoute, async (c) => {
    const { id } = c.req.valid("param")
    const d = deps()
    const result = await retryBatch(principalOf(c).workspaceId, id, d)
    if (result.retried.length) ctx.kickJobs(d.repos)
    return c.json(
      {
        batch: batchDetailView(
          { batch: result.batch, state: result.state },
          ctx.apiBaseUrl(c)
        ),
        retried: result.retried,
        skipped: result.skipped,
      },
      200
    )
  })

  app.openapi(cancelBatchRoute, async (c) => {
    const { id } = c.req.valid("param")
    const result = await cancelBatch(principalOf(c).workspaceId, id, deps())
    return c.json(
      {
        batch: batchDetailView(
          { batch: result.batch, state: result.state },
          ctx.apiBaseUrl(c)
        ),
        canceled: result.canceled,
        kept: result.kept,
        failures: result.failures,
      },
      200
    )
  })
}
