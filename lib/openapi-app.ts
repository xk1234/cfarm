/**
 * Public render API, `/api/v1` (Hono + zod-openapi).
 *
 * Auth: `Authorization: Bearer <workspace API key>` or the Clerk session (in
 * app). `/health`, `/openapi.json`, `/schema` and `/fonts` are public. Every
 * authenticated principal is rate limited by a per-key token bucket.
 *
 * Dependencies are injectable (`createOpenApiApp`) so tests run on memory
 * repositories, a fake `renderSpec` and a mocked publisher.
 */
import {
  createRoute,
  OpenAPIHono,
  z,
  type RouteConfig,
} from "@hono/zod-openapi"
import { publicOrigin } from "@/lib/http/public-origin"
import type { Context, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"

import {
  authenticateRequest,
  createDefaultRateLimiter,
  hasScope,
  rateLimitKey,
  type ApiPrincipal,
  type TokenBucketRateLimiter,
} from "@/lib/api-keys"
import { getCurrentUser } from "@/lib/auth"
import {
  DataConflictError,
  DataNotFoundError,
  DataQuotaError,
  getRepositories,
  type ApiKeyScope,
  type Collection,
  type Repositories,
} from "@/lib/data"
import {
  listFontFamilies,
  listFonts,
  renderSpec,
  type AssetLoader,
} from "@/lib/render/engine"
import {
  getSpecJsonSchema,
  resolveTemplate,
  SPEC_ISSUE_CODES,
  SPEC_LIMITS,
  SPEC_VERSION,
  SpecError,
  validateSpec,
  type SlotValues,
} from "@/lib/render/spec"
import {
  getPublisher,
  PUBLISHER_NOT_CONNECTED_MESSAGE,
  PublisherNotConfiguredError,
  PublisherRequestError,
  type Publisher,
} from "@/lib/publishing/publisher"
import {
  collectionMediaIds,
  importMediaFromUrl,
  MediaInputError,
  mediaView,
  storeMedia,
} from "@/lib/renders/media"
import {
  listPublishableAccounts,
  postView,
  PublishRequestError,
  scheduleRenderPost,
} from "@/lib/renders/publish"
import {
  buildRenderZip,
  issuesForRenderError,
  loadTemplateSpec,
  readRenderSlide,
  RenderRequestError,
  renderView,
  slideFilename,
  statusForIssues,
  submitRender,
  type RenderEngine,
} from "@/lib/renders/service"
import { listStarterTemplates, templateShape } from "@/lib/renders/starters"
import { BatchRequestError, batchPlanView } from "@/lib/batches/service"
import { kickJobs } from "@/lib/jobs/inline"
import { registerBatchRoutes } from "@/lib/openapi-batches"

export type ApiAppDeps = {
  repositories: () => Repositories
  renderSpec: RenderEngine
  publisher: () => Publisher
  /** Clerk session → workspace id (Clerk user id). */
  sessionWorkspaceId: () => Promise<string | null>
  assetLoader?: (repos: Repositories, workspaceId: string) => AssetLoader
  rateLimiter: TokenBucketRateLimiter
  now: () => Date
  /** After a request enqueued jobs: wake the worker (and drain inline in local e2e). */
  kickJobs: (repos: Repositories) => void
}

type ApiEnv = { Variables: { principal: ApiPrincipal } }
type ApiContext = Context<ApiEnv>

const PUBLIC_PATHS = new Set([
  "/health",
  "/openapi.json",
  "/schema",
  "/schema/slideshow-spec",
  "/fonts",
])

// ─────────────────────────────── shared schemas ───────────────────────────────

const IssueSchema = z
  .object({
    code: z.string(),
    path: z.string().openapi({ description: "RFC 6901 JSON Pointer" }),
    message: z.string(),
    slide: z.number().int().optional(),
  })
  .openapi("SpecIssue")

const ErrorSchema = z
  .object({ error: z.string(), code: z.string().optional() })
  .openapi("Error")

const ValidationErrorSchema = z
  .object({
    ok: z.literal(false),
    errors: z.array(IssueSchema),
    warnings: z.array(IssueSchema),
  })
  .openapi("ValidationError")

const AnyObject = z.record(z.string(), z.unknown())
const SpecBody = AnyObject.openapi("SlideshowSpec", {
  description:
    "Slideshow spec v1. The full JSON Schema is served at GET /api/v1/schema.",
})

const RenderSlideSchema = z.object({
  index: z.number().int(),
  id: z.string(),
  url: z.string(),
  mime: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  sha256: z.string().nullable(),
})
const RenderSchema = z
  .object({
    id: z.string(),
    status: z.enum(["queued", "rendering", "succeeded", "failed"]),
    source: z.string(),
    title: z.string().nullable(),
    templateId: z.string().nullable(),
    format: z.string(),
    scale: z.number(),
    slideCount: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    renderHash: z.string().nullable(),
    slides: z.array(RenderSlideSchema),
    zipUrl: z.string().nullable(),
    warnings: z.array(IssueSchema),
    error: z.string().nullable(),
    jobId: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
    resolvedSpec: AnyObject.optional(),
    slotValues: AnyObject.nullable().optional(),
  })
  .openapi("Render")

const TemplateSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    starter: z.boolean(),
    aspectRatio: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    slideCount: z.number().int(),
    imageSlotCount: z.number().int(),
    updatedAt: z.string().nullable(),
  })
  .openapi("TemplateSummary")

const CollectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    mediaKind: z.string(),
    pinned: z.boolean(),
    itemCount: z.number().int(),
    coverMediaId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Collection")

const MediaSchema = z
  .object({
    id: z.string(),
    collectionId: z.string().nullable(),
    kind: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    name: z.string().nullable(),
    caption: z.string().nullable(),
    source: z.string(),
    sourceUrl: z.string().nullable(),
    attribution: z.string().nullable(),
    position: z.number().nullable(),
    createdAt: z.string(),
    url: z.string(),
  })
  .openapi("Media")

const PostSchema = z
  .object({
    id: z.string(),
    renderId: z.string(),
    provider: z.string(),
    accountId: z.string(),
    status: z.string(),
    publishAt: z.string().nullable(),
    publishedAt: z.string().nullable(),
    caption: z.string(),
    platformOptions: AnyObject,
    providerPostId: z.string().nullable(),
    permalink: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Post")

const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})

/** Description-only responses (no content) keep handlers free to return any Response. */
const authResponses = {
  401: { description: "Missing or invalid credentials." },
  403: { description: "The API key lacks the required scope." },
  429: { description: "Rate limited; see Retry-After." },
} as const

const bearer = [{ bearerAuth: [] }]

function route<R extends RouteConfig>(config: R): R {
  return createRoute(config)
}

// ─────────────────────────────── routes ───────────────────────────────

const healthRoute = route({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Check API availability",
  responses: {
    200: json(
      z
        .object({ status: z.literal("ok"), timestamp: z.iso.datetime() })
        .openapi("HealthResponse"),
      "The API is available."
    ),
  },
})

const schemaRoute = route({
  method: "get",
  path: "/schema",
  tags: ["Specs"],
  summary:
    "JSON Schema for slideshow spec v1, plus fonts, limits and issue codes",
  responses: {
    200: json(
      z.object({
        specVersion: z.number().int(),
        schema: AnyObject,
        fonts: z.array(AnyObject),
        limits: AnyObject,
        issueCodes: z.array(z.string()),
      }),
      "The spec JSON Schema (draft 2020-12)."
    ),
    429: authResponses[429],
  },
})

const fontsRoute = route({
  method: "get",
  path: "/fonts",
  tags: ["Specs"],
  summary: "List the bundled fonts",
  responses: {
    200: json(
      z.object({
        families: z.array(z.string()),
        fonts: z.array(
          z.object({
            family: z.string(),
            weights: z.array(z.number().int()),
            style: z.enum(["normal", "italic"]),
            file: z.string(),
            category: z.string(),
            variable: z.boolean().optional(),
          })
        ),
      }),
      "Font registry."
    ),
    429: authResponses[429],
  },
})

const validateRoute = route({
  method: "post",
  path: "/specs/validate",
  tags: ["Specs"],
  summary: "Validate a spec (and optionally slot values)",
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.looseObject({
            spec: SpecBody,
            slotValues: AnyObject.optional(),
            resolve: z.boolean().optional().openapi({
              description:
                "Also resolve the template (collection picks included) and return resolvedSpec.",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: json(
      z.object({
        ok: z.boolean(),
        errors: z.array(IssueSchema),
        warnings: z.array(IssueSchema),
        resolvedSpec: AnyObject.optional(),
      }),
      "Validation result (ok or not)."
    ),
    ...authResponses,
  },
})

const listTemplatesRoute = route({
  method: "get",
  path: "/templates",
  tags: ["Templates"],
  summary: "List starter and workspace templates",
  security: bearer,
  request: { query: PageQuery },
  responses: {
    200: json(
      z.object({
        templates: z.array(
          TemplateSummarySchema.extend({ spec: SpecBody.optional() })
        ),
        nextCursor: z.string().nullable(),
      }),
      "Starter templates first (first page only, spec inline), then workspace templates (fetch the spec by id)."
    ),
    ...authResponses,
  },
})

const getTemplateRoute = route({
  method: "get",
  path: "/templates/{id}",
  tags: ["Templates"],
  summary: "Get a template with its spec and slot definitions",
  security: bearer,
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: json(
      z.object({
        template: TemplateSummarySchema.extend({
          spec: SpecBody,
          slots: AnyObject,
          exampleSlotValues: AnyObject.nullable(),
        }),
      }),
      "The template."
    ),
    404: json(ErrorSchema, "Unknown template."),
    ...authResponses,
  },
})

const createRenderRoute = route({
  method: "post",
  path: "/renders",
  tags: ["Renders"],
  summary: "Render a spec or a template with slot values",
  description:
    "Renders with at most 10 slides (scale ≤ 2) run synchronously and return 201; bigger renders, or `wait: false`, " +
    "return 202 with a queued render and job id. A repeated `idempotencyKey` returns the existing render with 200.",
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .looseObject({
              templateId: z.string().optional(),
              spec: SpecBody.optional(),
              slotValues: AnyObject.optional(),
              slots: AnyObject.optional().openapi({
                description: "Alias of slotValues.",
              }),
              output: z
                .object({
                  format: z.enum(["png", "jpeg", "webp"]).optional(),
                  quality: z.number().min(0).max(1).optional(),
                  scale: z.number().min(0.5).max(2).optional(),
                  zip: z.boolean().optional(),
                })
                .optional(),
              title: z.string().optional(),
              wait: z.boolean().optional(),
              idempotencyKey: z.string().optional(),
            })
            .openapi("RenderRequest"),
        },
      },
    },
  },
  responses: {
    200: json(
      z.object({ render: RenderSchema }),
      "Existing render for this idempotency key."
    ),
    201: json(z.object({ render: RenderSchema }), "Rendered synchronously."),
    202: json(
      z.object({ render: RenderSchema, jobId: z.string() }),
      "Queued for the worker."
    ),
    404: json(ErrorSchema, "Unknown template."),
    413: json(ValidationErrorSchema, "Spec too large."),
    422: json(
      ValidationErrorSchema,
      "Invalid spec, slot values or render failure."
    ),
    424: json(ValidationErrorSchema, "An image could not be fetched."),
    ...authResponses,
  },
})

const listRendersRoute = route({
  method: "get",
  path: "/renders",
  tags: ["Renders"],
  summary: "List renders, newest first",
  security: bearer,
  request: {
    query: PageQuery.extend({
      status: z.enum(["queued", "rendering", "succeeded", "failed"]).optional(),
      templateId: z.string().optional(),
    }),
  },
  responses: {
    200: json(
      z.object({
        renders: z.array(RenderSchema),
        nextCursor: z.string().nullable(),
      }),
      "Renders."
    ),
    ...authResponses,
  },
})

const RenderIdParams = z.object({ id: z.string().min(1) })

const getRenderRoute = route({
  method: "get",
  path: "/renders/{id}",
  tags: ["Renders"],
  summary: "Get a render's status, outputs and resolved spec",
  security: bearer,
  request: { params: RenderIdParams },
  responses: {
    200: json(z.object({ render: RenderSchema }), "The render."),
    404: json(ErrorSchema, "Unknown render."),
    ...authResponses,
  },
})

const deleteRenderRoute = route({
  method: "delete",
  path: "/renders/{id}",
  tags: ["Renders"],
  summary: "Delete a render",
  security: bearer,
  request: { params: RenderIdParams },
  responses: {
    204: { description: "Deleted." },
    404: json(ErrorSchema, "Unknown render."),
    409: json(ErrorSchema, "The render has scheduled posts."),
    ...authResponses,
  },
})

const renderSlideRoute = route({
  method: "get",
  path: "/renders/{id}/slides/{index}",
  tags: ["Renders"],
  summary: "Download one rendered slide (0-based index)",
  security: bearer,
  request: {
    params: z.object({
      id: z.string().min(1),
      index: z.coerce.number().int().min(0),
    }),
    query: z.object({ download: z.enum(["0", "1"]).optional() }),
  },
  responses: {
    200: {
      description: "The slide image.",
      content: {
        "image/png": { schema: z.string().openapi({ format: "binary" }) },
        "image/jpeg": { schema: z.string().openapi({ format: "binary" }) },
        "image/webp": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: json(ErrorSchema, "Unknown render or slide."),
    ...authResponses,
  },
})

const renderZipRoute = route({
  method: "get",
  path: "/renders/{id}/zip",
  tags: ["Renders"],
  summary: "Download every slide as a ZIP",
  security: bearer,
  request: { params: RenderIdParams },
  responses: {
    200: {
      description: "ZIP archive.",
      content: {
        "application/zip": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: json(ErrorSchema, "Unknown or unfinished render."),
    ...authResponses,
  },
})

const listCollectionsRoute = route({
  method: "get",
  path: "/collections",
  tags: ["Media"],
  summary: "List image collections",
  security: bearer,
  request: { query: PageQuery },
  responses: {
    200: json(
      z.object({
        collections: z.array(CollectionSchema),
        nextCursor: z.string().nullable(),
      }),
      "Collections."
    ),
    ...authResponses,
  },
})

const createCollectionRoute = route({
  method: "post",
  path: "/collections",
  tags: ["Media"],
  summary: "Create an image collection",
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ name: z.string().trim().min(1).max(128) }),
        },
      },
    },
  },
  responses: {
    201: json(z.object({ collection: CollectionSchema }), "Created."),
    409: json(ErrorSchema, "A collection with this name exists."),
    ...authResponses,
  },
})

const listMediaRoute = route({
  method: "get",
  path: "/media",
  tags: ["Media"],
  summary: "List media (all, one collection, or the uploads library)",
  security: bearer,
  request: {
    query: PageQuery.extend({
      collectionId: z
        .string()
        .optional()
        .openapi({
          description: "A collection id, or `uploads` for unfiled media.",
        }),
    }),
  },
  responses: {
    200: json(
      z.object({
        media: z.array(MediaSchema),
        nextCursor: z.string().nullable(),
      }),
      "Media."
    ),
    ...authResponses,
  },
})

const uploadMediaRoute = route({
  method: "post",
  path: "/media",
  tags: ["Media"],
  summary:
    "Upload an image (multipart `file`) or import one from a public URL (JSON `{url}`)",
  description:
    "multipart/form-data with `file` and optional `collectionId`, or application/json `{ url, collectionId? }`. " +
    "Images only (png, jpeg, webp, gif, avif), at most 25 MB. Identical files are deduplicated per collection.",
  security: bearer,
  responses: {
    200: json(
      z.object({ media: MediaSchema, created: z.literal(false) }),
      "Already stored."
    ),
    201: json(
      z.object({ media: MediaSchema, created: z.literal(true) }),
      "Stored."
    ),
    404: json(ErrorSchema, "Unknown collection."),
    413: json(ErrorSchema, "File too large."),
    415: json(ErrorSchema, "Unsupported type."),
    422: json(ErrorSchema, "Invalid input or URL."),
    424: json(ErrorSchema, "The URL could not be fetched."),
    ...authResponses,
  },
})

const mediaFileRoute = route({
  method: "get",
  path: "/media/{id}/file",
  tags: ["Media"],
  summary: "Download a media file (ownership-checked)",
  security: bearer,
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: "The image.",
      content: {
        "image/*": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: json(ErrorSchema, "Unknown media."),
    ...authResponses,
  },
})

const accountsRoute = route({
  method: "get",
  path: "/accounts",
  tags: ["Publishing"],
  summary: "Publishing status and connected SocialBu accounts",
  security: bearer,
  responses: {
    200: json(
      z.object({
        connected: z.boolean(),
        message: z.string().nullable(),
        accounts: z.array(
          z.object({
            id: z.string(),
            provider: z.string(),
            name: z.string(),
            active: z.boolean(),
            avatarUrl: z.string().nullable(),
          })
        ),
      }),
      "Accounts (empty with connected=false when SocialBu is not configured)."
    ),
    ...authResponses,
  },
})

const createPostRoute = route({
  method: "post",
  path: "/posts",
  tags: ["Publishing"],
  summary: "Publish or schedule a succeeded render to SocialBu accounts",
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .looseObject({
              renderId: z.string(),
              accountIds: z.array(z.string()),
              caption: z.string().optional(),
              publishAt: z
                .string()
                .nullable()
                .optional()
                .openapi({ description: "ISO 8601; omit to publish now." }),
              platformOptions: AnyObject.optional(),
              draft: z.boolean().optional(),
              idempotencyKey: z.string().optional(),
            })
            .openapi("SchedulePostRequest"),
        },
      },
    },
  },
  responses: {
    201: json(
      z.object({ posts: z.array(PostSchema) }),
      "Posts created at SocialBu."
    ),
    404: json(ErrorSchema, "Unknown render."),
    409: json(ErrorSchema, "The render is not publishable."),
    422: json(ErrorSchema, "Invalid request."),
    502: json(ErrorSchema, "SocialBu rejected the request."),
    503: json(ErrorSchema, "SocialBu not connected."),
    ...authResponses,
  },
})

const listPostsRoute = route({
  method: "get",
  path: "/posts",
  tags: ["Publishing"],
  summary: "List posts for a time range (calendar) or a render",
  security: bearer,
  request: {
    query: z.object({
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
      renderId: z.string().optional(),
    }),
  },
  responses: {
    200: json(z.object({ posts: z.array(PostSchema) }), "Posts."),
    ...authResponses,
  },
})

// ─────────────────────────────── helpers ───────────────────────────────

const ROUTE_SCOPES: { method: string; pattern: RegExp; scope: ApiKeyScope }[] =
  [
    { method: "GET", pattern: /^\/templates/, scope: "templates:read" },
    { method: "POST", pattern: /^\/renders/, scope: "renders:write" },
    { method: "DELETE", pattern: /^\/renders/, scope: "renders:write" },
    { method: "GET", pattern: /^\/renders/, scope: "renders:read" },
    { method: "GET", pattern: /^\/(collections|media)/, scope: "media:read" },
    { method: "POST", pattern: /^\/(collections|media)/, scope: "media:write" },
    { method: "GET", pattern: /^\/(posts|accounts)/, scope: "posts:read" },
    { method: "POST", pattern: /^\/posts/, scope: "posts:write" },
    // Preview writes nothing, so reading is enough.
    { method: "POST", pattern: /^\/batches\/preview$/, scope: "batches:read" },
    { method: "POST", pattern: /^\/batches/, scope: "batches:write" },
    { method: "GET", pattern: /^\/batches/, scope: "batches:read" },
  ]

/** Authenticated routes that need a principal but no particular scope. */
const SCOPE_FREE_ROUTES: { method: string; path: string }[] = [
  { method: "POST", path: "/specs/validate" },
]

/**
 * The scope an API key needs for `method path`. `undefined` means the route is
 * not in the table: callers must refuse API keys for it (fail closed) so an
 * unlisted or oddly spelled path never skips the check.
 */
export function requiredScope(
  method: string,
  path: string
): ApiKeyScope | null | undefined {
  const rule = ROUTE_SCOPES.find(
    (r) => r.method === method && r.pattern.test(path)
  )
  if (rule) return rule.scope
  if (SCOPE_FREE_ROUTES.some((r) => r.method === method && r.path === path))
    return null
  return undefined
}

/**
 * The path below `/api/v1` exactly as Hono routes it: `c.req.path` is decoded
 * the same way the router decodes it, so `%72enders` is checked as `renders`.
 * Duplicate slashes are collapsed so `//renders` cannot dodge the table either.
 */
function apiPath(c: Context): string {
  const path = c.req.path.replace(/\/{2,}/g, "/")
  return path.replace(/^\/api\/v1/, "") || "/"
}

function apiBaseUrl(c: Context): string {
  return `${publicOrigin(c.req.url, c.req.raw.headers)}/api/v1`
}

function errorJson(c: Context, status: number, error: string, code?: string) {
  return c.json(code ? { error, code } : { error }, status as 400)
}

function collectionView(collection: Collection) {
  return {
    id: collection.id,
    name: collection.name,
    mediaKind: collection.mediaKind,
    pinned: collection.pinned,
    itemCount: collection.itemCount,
    coverMediaId: collection.coverMediaId,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  }
}

function binary(
  bytes: Uint8Array,
  mime: string,
  filename: string,
  download: boolean
) {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": mime,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, max-age=300",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  })
}

// ─────────────────────────────── app ───────────────────────────────

const defaultDeps = (): ApiAppDeps => ({
  repositories: getRepositories,
  renderSpec,
  publisher: () => getPublisher(),
  sessionWorkspaceId: async () => (await getCurrentUser())?.$id ?? null,
  rateLimiter: createDefaultRateLimiter(),
  now: () => new Date(),
  kickJobs: (repos) => kickJobs(repos),
})

export function createOpenApiApp(overrides: Partial<ApiAppDeps> = {}) {
  const deps: ApiAppDeps = { ...defaultDeps(), ...overrides }
  const app = new OpenAPIHono<ApiEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            ok: false as const,
            errors: result.error.issues.map((issue) => ({
              code: `schema.${issue.code}`,
              path: issue.path.length
                ? "/" + issue.path.map(String).join("/")
                : "",
              message: issue.message,
            })),
            warnings: [],
          },
          422
        )
      }
    },
  }).basePath("/api/v1")

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Workspace API key (`lc_…`), created in Settings → API keys.",
  })

  const authenticate: MiddlewareHandler<ApiEnv> = async (c, next) => {
    const path = apiPath(c)
    if (c.req.method === "OPTIONS" || PUBLIC_PATHS.has(path)) return next()
    const principal = await authenticateRequest(c.req.raw.headers, {
      repos: deps.repositories(),
      sessionWorkspaceId: deps.sessionWorkspaceId,
      now: deps.now(),
    })
    if (!principal) {
      c.header("www-authenticate", 'Bearer realm="lumenclip"')
      return errorJson(
        c,
        401,
        "Authentication required: send a workspace API key as a Bearer token.",
        "auth.required"
      )
    }
    const scope = requiredScope(c.req.method, path)
    if (scope === undefined && principal.kind === "api_key") {
      return errorJson(
        c,
        403,
        "This API key cannot call this route.",
        "auth.scope"
      )
    }
    if (scope && !hasScope(principal, scope)) {
      return errorJson(
        c,
        403,
        `This API key lacks the "${scope}" scope.`,
        "auth.scope"
      )
    }
    const decision = deps.rateLimiter.take(rateLimitKey(principal))
    c.header("x-ratelimit-remaining", String(decision.remaining))
    if (!decision.allowed) {
      c.header("retry-after", String(decision.retryAfterSeconds))
      return errorJson(c, 429, "Rate limit exceeded.", "rate_limited")
    }
    c.set("principal", principal)
    return next()
  }
  app.use("*", authenticate)

  app.onError((error, c) => {
    if (error instanceof BatchRequestError) {
      return c.json(
        {
          ok: false,
          error: error.message,
          errors: error.errors,
          warnings: error.warnings,
          ...(error.plan ? { preview: batchPlanView(error.plan) } : {}),
        },
        error.status as 422
      )
    }
    if (error instanceof RenderRequestError) {
      if (error.status === 404)
        return errorJson(c, 404, error.message, "not_found")
      return c.json(
        { ok: false, errors: error.errors, warnings: error.warnings },
        error.status as 422
      )
    }
    if (error instanceof PublisherNotConfiguredError) {
      return errorJson(c, 503, PUBLISHER_NOT_CONNECTED_MESSAGE, error.code)
    }
    if (error instanceof PublisherRequestError) {
      return errorJson(
        c,
        502,
        `SocialBu: ${error.message}`,
        "publisher.request_failed"
      )
    }
    if (
      error instanceof PublishRequestError ||
      error instanceof MediaInputError
    ) {
      return errorJson(c, error.status, error.message)
    }
    if (error instanceof DataNotFoundError)
      return errorJson(c, 404, error.message, "not_found")
    if (error instanceof DataConflictError)
      return errorJson(c, 409, error.message, "conflict")
    if (error instanceof DataQuotaError)
      return errorJson(c, 429, error.message, "quota")
    if (error instanceof HTTPException) return error.getResponse()
    console.error("[api/v1]", error)
    return errorJson(c, 500, "Internal server error")
  })

  const repos = () => deps.repositories()
  const principalOf = (c: ApiContext) => c.get("principal")
  const renderDeps = () => {
    const r = repos()
    return {
      repos: r,
      renderSpec: deps.renderSpec,
      assetLoader: deps.assetLoader
        ? (ws: string) => deps.assetLoader!(r, ws)
        : undefined,
    }
  }

  app.openapi(healthRoute, (c) =>
    c.json({ status: "ok" as const, timestamp: deps.now().toISOString() }, 200)
  )

  const schemaBody = () => ({
    specVersion: SPEC_VERSION,
    schema: getSpecJsonSchema(),
    fonts: listFonts().map((f) => ({ ...f })),
    limits: { ...SPEC_LIMITS },
    issueCodes: [...SPEC_ISSUE_CODES],
  })
  app.openapi(schemaRoute, (c) => c.json(schemaBody(), 200))
  app.get("/schema/slideshow-spec", (c) => c.json(schemaBody(), 200))

  app.openapi(fontsRoute, (c) =>
    c.json(
      {
        families: listFontFamilies(),
        fonts: listFonts().map((f) => ({ ...f })),
      },
      200
    )
  )

  app.openapi(validateRoute, async (c) => {
    const { spec, slotValues, resolve } = c.req.valid("json")
    const result = validateSpec(
      spec,
      slotValues !== undefined ? { slotValues } : {}
    )
    const body: {
      ok: boolean
      errors: typeof result.errors
      warnings: typeof result.warnings
      resolvedSpec?: Record<string, unknown>
    } = { ok: result.ok, errors: result.errors, warnings: result.warnings }
    if (result.ok && result.spec && resolve) {
      const workspaceId = principalOf(c).workspaceId
      try {
        const resolved = await resolveTemplate(
          result.spec,
          (slotValues ?? {}) as SlotValues,
          {
            resolveCollection: (ref) =>
              collectionMediaIds(repos(), workspaceId, ref),
          }
        )
        body.resolvedSpec = resolved as unknown as Record<string, unknown>
      } catch (error) {
        if (!(error instanceof SpecError)) throw error
        body.ok = false
        body.errors = error.errors
      }
    }
    return c.json(body, 200)
  })

  app.openapi(listTemplatesRoute, async (c) => {
    const { cursor, limit } = c.req.valid("query")
    const page = await repos().templates.list(principalOf(c).workspaceId, {
      cursor,
      limit,
    })
    const starters = cursor
      ? []
      : listStarterTemplates().map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description || null,
          starter: true,
          ...templateShape(s.spec),
          updatedAt: null,
          spec: s.spec as unknown as Record<string, unknown>,
        }))
    const stored = page.items.map((t) => ({
      id: t.id,
      name: t.name,
      starter: false,
      aspectRatio: t.aspectRatio,
      width: null,
      height: null,
      slideCount: t.slideCount,
      imageSlotCount: t.imageSlotCount,
      updatedAt: t.updatedAt,
    }))
    return c.json(
      { templates: [...starters, ...stored], nextCursor: page.nextCursor },
      200
    )
  })

  app.openapi(getTemplateRoute, async (c) => {
    const { id } = c.req.valid("param")
    const template = await loadTemplateSpec(
      repos(),
      principalOf(c).workspaceId,
      id
    )
    if (!template) return errorJson(c, 404, "Template not found", "not_found")
    const starter = listStarterTemplates().find((s) => s.id === template.id)
    const stored = starter
      ? null
      : await repos().templates.get(principalOf(c).workspaceId, id)
    return c.json(
      {
        template: {
          id: template.id,
          name: template.name,
          starter: !!starter,
          ...templateShape(template.spec),
          updatedAt: stored?.updatedAt ?? null,
          spec: template.spec as unknown as Record<string, unknown>,
          slots: (template.spec.slots ?? {}) as Record<string, unknown>,
          exampleSlotValues: (starter?.exampleSlotValues ?? null) as Record<
            string,
            unknown
          > | null,
        },
      },
      200
    )
  })

  app.openapi(createRenderRoute, async (c) => {
    const principal = principalOf(c)
    const body = c.req.valid("json")
    const result = await submitRender(
      renderDeps(),
      principal.workspaceId,
      body,
      {
        source: principal.kind === "api_key" ? "api" : "ui",
        createdBy: principal.actor,
        apiKeyId: principal.apiKeyId,
      }
    )
    const view = renderView(result.render, apiBaseUrl(c), { includeSpec: true })
    if (result.mode === "replay") return c.json({ render: view }, 200)
    if (result.mode === "async")
      return c.json({ render: view, jobId: result.jobId }, 202)
    if (result.error) {
      const errors = issuesForRenderError(result.error)
      return c.json(
        { ok: false as const, errors, warnings: [], render: view },
        statusForIssues(errors) as 422
      )
    }
    return c.json({ render: view }, 201)
  })

  app.openapi(listRendersRoute, async (c) => {
    const { cursor, limit, status, templateId } = c.req.valid("query")
    const page = await repos().renders.list(principalOf(c).workspaceId, {
      cursor,
      limit,
      status,
      templateId,
    })
    const base = apiBaseUrl(c)
    return c.json(
      {
        renders: page.items.map((r) => renderView(r, base)),
        nextCursor: page.nextCursor,
      },
      200
    )
  })

  app.openapi(getRenderRoute, async (c) => {
    const { id } = c.req.valid("param")
    const render = await repos().renders.get(principalOf(c).workspaceId, id)
    if (!render) return errorJson(c, 404, "Render not found", "not_found")
    return c.json(
      { render: renderView(render, apiBaseUrl(c), { includeSpec: true }) },
      200
    )
  })

  app.openapi(deleteRenderRoute, async (c) => {
    const { id } = c.req.valid("param")
    const workspaceId = principalOf(c).workspaceId
    const render = await repos().renders.get(workspaceId, id)
    if (!render) return errorJson(c, 404, "Render not found", "not_found")
    const posts = await repos().posts.listByRender(workspaceId, id)
    if (
      posts.some((p) => p.status === "scheduled" || p.status === "publishing")
    ) {
      return errorJson(
        c,
        409,
        "Cancel this render's scheduled posts before deleting it.",
        "conflict"
      )
    }
    await repos().renders.softDelete(workspaceId, id)
    return c.body(null, 204)
  })

  app.openapi(renderSlideRoute, async (c) => {
    const { id, index } = c.req.valid("param")
    const { download } = c.req.valid("query")
    const found = await readRenderSlide(
      repos(),
      principalOf(c).workspaceId,
      id,
      index
    )
    if (!found) return errorJson(c, 404, "Slide not found", "not_found")
    return binary(
      found.bytes,
      found.mime,
      slideFilename(found.render, found.slide),
      download === "1"
    )
  })

  app.openapi(renderZipRoute, async (c) => {
    const { id } = c.req.valid("param")
    const zip = await buildRenderZip(repos(), principalOf(c).workspaceId, id)
    if (!zip)
      return errorJson(c, 404, "Render not found or not finished", "not_found")
    return binary(zip.bytes, "application/zip", zip.filename, true)
  })

  app.openapi(listCollectionsRoute, async (c) => {
    const { cursor, limit } = c.req.valid("query")
    const page = await repos().collections.list(principalOf(c).workspaceId, {
      cursor,
      limit,
    })
    return c.json(
      {
        collections: page.items.map(collectionView),
        nextCursor: page.nextCursor,
      },
      200
    )
  })

  app.openapi(createCollectionRoute, async (c) => {
    const { name } = c.req.valid("json")
    const principal = principalOf(c)
    const collection = await repos().collections.create(principal.workspaceId, {
      name,
      mediaKind: "image",
      createdBy: principal.actor,
    })
    return c.json({ collection: collectionView(collection) }, 201)
  })

  const mediaWithUrl = (
    c: Context,
    media: Parameters<typeof mediaView>[0]
  ) => ({
    ...mediaView(media),
    url: `${apiBaseUrl(c)}/media/${media.id}/file`,
  })

  app.openapi(listMediaRoute, async (c) => {
    const { cursor, limit, collectionId } = c.req.valid("query")
    const page = await repos().media.list(principalOf(c).workspaceId, {
      cursor,
      limit,
      ...(collectionId === undefined
        ? {}
        : { collectionId: collectionId === "uploads" ? null : collectionId }),
    })
    return c.json(
      {
        media: page.items
          .filter((m) => !m.deletedAt)
          .map((m) => mediaWithUrl(c, m)),
        nextCursor: page.nextCursor,
      },
      200
    )
  })

  app.openapi(uploadMediaRoute, async (c) => {
    const principal = principalOf(c)
    const contentType = c.req.header("content-type") ?? ""
    let result: Awaited<ReturnType<typeof storeMedia>>
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.raw.formData().catch(() => null)
      const file = form?.get("file")
      if (!form || !(file instanceof Blob))
        return errorJson(c, 422, 'Send the image as multipart field "file".')
      const collectionId = form.get("collectionId")
      result = await storeMedia(repos(), principal.workspaceId, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type,
        name:
          "name" in file && typeof file.name === "string" ? file.name : null,
        collectionId:
          typeof collectionId === "string" && collectionId
            ? collectionId
            : null,
        source: "upload",
        createdBy: principal.actor,
      })
    } else {
      const body = (await c.req.json().catch(() => null)) as {
        url?: unknown
        collectionId?: unknown
        name?: unknown
      } | null
      if (!body || typeof body.url !== "string") {
        return errorJson(
          c,
          422,
          'Send multipart "file" or JSON { "url": "https://…" }.'
        )
      }
      try {
        result = await importMediaFromUrl(repos(), principal.workspaceId, {
          url: body.url,
          collectionId:
            typeof body.collectionId === "string" ? body.collectionId : null,
          name: typeof body.name === "string" ? body.name : null,
          createdBy: principal.actor,
        })
      } catch (error) {
        if (error instanceof MediaInputError) throw error
        const message =
          error instanceof Error ? error.message : "Could not fetch the image."
        const code = (error as { code?: string }).code
        const status =
          code === "asset.too_large"
            ? 413
            : code === "asset.unsupported_type"
              ? 415
              : 424
        return errorJson(c, status, message, code)
      }
    }
    return c.json(
      { media: mediaWithUrl(c, result.media), created: result.created },
      result.created ? 201 : 200
    )
  })

  app.openapi(mediaFileRoute, async (c) => {
    const { id } = c.req.valid("param")
    const workspaceId = principalOf(c).workspaceId
    const media = await repos().media.get(workspaceId, id)
    const blob =
      media && !media.deletedAt
        ? await repos().blobs.get(workspaceId, media.bucketId, media.fileId)
        : null
    if (!media || !blob)
      return errorJson(c, 404, "Media not found", "not_found")
    return binary(blob.bytes, media.mimeType, media.name ?? media.id, false)
  })

  app.openapi(accountsRoute, async (c) => {
    const publisher = deps.publisher()
    if (!publisher.configured) {
      return c.json(
        {
          connected: false,
          message: PUBLISHER_NOT_CONNECTED_MESSAGE,
          accounts: [],
        },
        200
      )
    }
    const accounts = await listPublishableAccounts(
      repos(),
      publisher,
      principalOf(c).workspaceId
    )
    return c.json(
      {
        connected: true,
        message: null,
        accounts: accounts.map(({ id, provider, name, active, avatarUrl }) => ({
          id,
          provider,
          name,
          active,
          avatarUrl,
        })),
      },
      200
    )
  })

  app.openapi(createPostRoute, async (c) => {
    const principal = principalOf(c)
    const result = await scheduleRenderPost(
      repos(),
      deps.publisher(),
      principal.workspaceId,
      c.req.valid("json"),
      {
        createdBy: principal.actor,
        now: deps.now,
      }
    )
    return c.json({ posts: result.posts.map(postView) }, 201)
  })

  app.openapi(listPostsRoute, async (c) => {
    const { from, to, renderId } = c.req.valid("query")
    const workspaceId = principalOf(c).workspaceId
    if (renderId) {
      const posts = await repos().posts.listByRender(workspaceId, renderId)
      return c.json({ posts: posts.map(postView) }, 200)
    }
    const now = deps.now().getTime()
    const range = {
      from: from
        ? new Date(from).toISOString()
        : new Date(now - 30 * 86_400_000).toISOString(),
      to: to
        ? new Date(to).toISOString()
        : new Date(now + 60 * 86_400_000).toISOString(),
    }
    const posts = await repos().posts.listRange(workspaceId, range)
    return c.json({ posts: posts.map(postView) }, 200)
  })

  registerBatchRoutes(app, {
    repos,
    publisher: () => deps.publisher(),
    now: deps.now,
    apiBaseUrl,
    kickJobs: deps.kickJobs,
  })

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "LumenClip Render API",
      version: "1.0.0",
      description:
        "Render slideshow/carousel specs to PNG slides, manage image collections, publish renders through SocialBu, and mass-produce scheduled carousel batches.",
    },
    security: [{ bearerAuth: [] }],
  })

  return app
}

export const openApiApp = createOpenApiApp()
