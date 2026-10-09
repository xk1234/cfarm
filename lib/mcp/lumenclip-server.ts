/**
 * LumenClip MCP server: spec-in, slides-out rendering plus collections,
 * outputs (renders), publishing (SocialBu) and the schedule.
 *
 * Every tool runs for one workspace (resolved from an API key by the HTTP
 * route or the stdio launcher) and codes against the repository, engine and
 * publisher contracts, so tests use memory repositories and fakes.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import {
  DataConflictError,
  DataNotFoundError,
  getRepositories,
  type Collection,
  type Job,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"
import { listFontFamilies, listFonts, renderSpec, type AssetLoader } from "@/lib/render/engine"
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
import type { RemoteFetchOptions } from "@/lib/renders/assets"
import { collectionMediaIds, importMediaFromUrl, MediaInputError, mediaView } from "@/lib/renders/media"
import { listPublishableAccounts, postView, PublishRequestError, scheduleRenderPost } from "@/lib/renders/publish"
import {
  issuesForRenderError,
  loadTemplateSpec,
  RenderRequestError,
  renderView,
  submitRender,
  type RenderEngine,
} from "@/lib/renders/service"
import { getStarterTemplate, listStarterTemplates, templateShape } from "@/lib/renders/starters"
import type { ApiKeyScope } from "@/lib/data/types"

import { mcpToolNamesOutsideScopes } from "./tool-registry"

export type LumenClipMcpServices = {
  now: () => Date
  repositories: () => Repositories
  renderSpec: RenderEngine
  publisher: () => Publisher
  /** Absolute API base for slide/ZIP URLs, e.g. `https://app.example/api/v1`. */
  apiBaseUrl: () => string
  assetLoader?: (repos: Repositories, workspaceId: WorkspaceId) => AssetLoader
  remoteFetch?: RemoteFetchOptions
}

export type LumenClipMcpOptions = {
  disabledToolNames?: Iterable<string>
  /** API key id the session authenticated with (recorded on renders). */
  apiKeyId?: string | null
  /**
   * Scopes of the authenticating API key. Tools needing a scope the key lacks
   * are disabled (not listed, calls refused). Omit only for trusted in-process use.
   */
  scopes?: readonly ApiKeyScope[]
}

function defaultApiBaseUrl() {
  const base = (process.env.BASE_URL ?? "").trim().replace(/\/$/, "")
  return `${base}/api/v1`
}

const defaultServices: LumenClipMcpServices = {
  now: () => new Date(),
  repositories: getRepositories,
  renderSpec,
  publisher: () => getPublisher(),
  apiBaseUrl: defaultApiBaseUrl,
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

const cursorInput = {
  cursor: z.string().optional().describe("Opaque cursor from a previous page's nextCursor."),
  limit: z.number().int().min(1).max(100).default(50).describe("Page size, e.g. 50."),
}

export function createLumenClipMcpServer(
  workspaceId: WorkspaceId,
  overrides: Partial<LumenClipMcpServices> = {},
  options: LumenClipMcpOptions = {}
) {
  const services: LumenClipMcpServices = { ...defaultServices, ...overrides }
  const server = new McpServer({ name: "lumenclip", version: "4.0.0" })
  const disabledToolNames = new Set<string>(options.disabledToolNames)
  if (options.scopes) {
    for (const name of mcpToolNamesOutsideScopes(options.scopes)) disabledToolNames.add(name)
  }
  const registerTool = server.registerTool.bind(server)
  server.registerTool = ((name: string, ...args: unknown[]) => {
    const tool = (registerTool as (...input: unknown[]) => ReturnType<typeof registerTool>)(name, ...args)
    if (disabledToolNames.has(name)) tool.disable()
    return tool
  }) as typeof server.registerTool

  const ctx: ToolContext = { workspaceId, services, apiKeyId: options.apiKeyId ?? null }
  registerSlideshowTools(server, ctx)
  registerCollectionTools(server, ctx)
  registerOutputTools(server, ctx)
  registerPublishingTools(server, ctx)
  registerScheduleTools(server, ctx)
  return server
}

type ToolContext = {
  workspaceId: WorkspaceId
  services: LumenClipMcpServices
  apiKeyId: string | null
}

// ─────────────────────────────── slideshows ───────────────────────────────

function registerSlideshowTools(server: McpServer, ctx: ToolContext) {
  const { services, workspaceId } = ctx
  const repos = () => services.repositories()

  server.registerTool(
    "lumenclip_spec_schema_get",
    {
      title: "Get the slideshow spec JSON Schema",
      description:
        "Returns the JSON Schema (draft 2020-12) for slideshow spec v1, the spec limits and every issue code validators can report. Read this before writing a spec.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () =>
      run(async () => ({
        specVersion: SPEC_VERSION,
        schema: getSpecJsonSchema(),
        limits: { ...SPEC_LIMITS },
        issueCodes: [...SPEC_ISSUE_CODES],
      }))
  )

  server.registerTool(
    "lumenclip_spec_validate",
    {
      title: "Validate a slideshow spec",
      description:
        "Validates a spec (template or plain) and, when slotValues are given, the slot values too. Returns ok, errors and warnings with JSON Pointer paths. Set resolve=true to also return the resolved spec (collection picks included). Never renders.",
      inputSchema: {
        spec: z.record(z.string(), z.unknown()).describe("Slideshow spec v1 object."),
        slotValues: z.record(z.string(), z.unknown()).optional().describe("Values for the template's slots."),
        resolve: z.boolean().default(false).describe("Also resolve the template and return resolvedSpec."),
      },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const result = validateSpec(input.spec, input.slotValues !== undefined ? { slotValues: input.slotValues } : {})
        const body: Record<string, unknown> = { ok: result.ok, errors: result.errors, warnings: result.warnings }
        if (result.ok && result.spec && input.resolve) {
          try {
            body.resolvedSpec = await resolveTemplate(result.spec, (input.slotValues ?? {}) as SlotValues, {
              resolveCollection: (ref) => collectionMediaIds(repos(), workspaceId, ref),
            })
          } catch (error) {
            if (!(error instanceof SpecError)) throw error
            body.ok = false
            body.errors = error.errors
          }
        }
        return body
      })
  )

  server.registerTool(
    "lumenclip_fonts_list",
    {
      title: "List fonts",
      description: "Lists the bundled font families, weights and styles a spec may reference. Fonts cannot be uploaded.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => run(async () => ({ families: listFontFamilies(), fonts: listFonts().map((f) => ({ ...f })) }))
  )

  server.registerTool(
    "lumenclip_templates_list",
    {
      title: "List slideshow templates",
      description:
        "Lists starter templates and this workspace's saved templates. Pass templateId to get one template with its full spec, slot definitions and example slot values.",
      inputSchema: {
        templateId: z.string().optional().describe('Template id, e.g. "starter-listicle".'),
        ...cursorInput,
      },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        if (input.templateId) {
          const template = await loadTemplateSpec(repos(), workspaceId, input.templateId)
          if (!template) throw new DataNotFoundError("template", input.templateId)
          const starter = getStarterTemplate(template.id)
          return {
            template: {
              id: template.id,
              name: template.name,
              starter: !!starter,
              ...templateShape(template.spec),
              slots: template.spec.slots ?? {},
              exampleSlotValues: starter?.exampleSlotValues ?? null,
              spec: template.spec,
            },
          }
        }
        const page = await repos().templates.list(workspaceId, { cursor: input.cursor, limit: input.limit })
        const starters = input.cursor
          ? []
          : listStarterTemplates().map((s) => ({ id: s.id, name: s.name, starter: true, ...templateShape(s.spec) }))
        return {
          templates: [
            ...starters,
            ...page.items.map((t) => ({
              id: t.id,
              name: t.name,
              starter: false,
              aspectRatio: t.aspectRatio,
              slideCount: t.slideCount,
              imageSlotCount: t.imageSlotCount,
            })),
          ],
          nextCursor: page.nextCursor,
        }
      })
  )

  server.registerTool(
    "lumenclip_slideshow_render",
    {
      title: "Render a slideshow",
      description:
        "Renders a spec, or a template (templateId) filled with slotValues, to one image per slide. Image slots take {media: id}, {url}, or {collection, pick: \"random\", seed}. Renders with at most 10 slides finish inline; larger ones (or wait=false) are queued and can be polled with lumenclip_render_get. Returns slide URLs, not bytes.",
      inputSchema: {
        templateId: z.string().optional().describe("Starter or saved template id. Exactly one of templateId or spec."),
        spec: z.record(z.string(), z.unknown()).optional().describe("Inline slideshow spec v1."),
        slotValues: z.record(z.string(), z.unknown()).optional().describe("Values for the template's slots."),
        output: z
          .object({
            format: z.enum(["png", "jpeg", "webp"]).optional(),
            quality: z.number().min(0).max(1).optional(),
            scale: z.number().min(0.5).max(2).optional(),
          })
          .optional()
          .describe("Output format (default png) and scale (0.5..2, default 1)."),
        title: z.string().max(512).optional().describe("Used for file names."),
        wait: z.boolean().optional().describe("false always queues the render."),
        idempotencyKey: z
          .string()
          .min(1)
          .max(128)
          .optional()
          .describe("Repeat-safe key; also seeds random collection picks."),
      },
      annotations: { ...WRITE, openWorldHint: true },
    },
    async (input) =>
      run(async () => {
        const r = repos()
        const result = await submitRender(
          {
            repos: r,
            renderSpec: services.renderSpec,
            assetLoader: services.assetLoader ? (ws) => services.assetLoader!(r, ws) : undefined,
          },
          workspaceId,
          stripUndefined(input),
          { source: "mcp", createdBy: ctx.apiKeyId ? `api-key:${ctx.apiKeyId}` : workspaceId, apiKeyId: ctx.apiKeyId }
        )
        const render = renderView(result.render, services.apiBaseUrl())
        return {
          mode: result.mode,
          jobId: result.jobId,
          render,
          ...(result.error ? { errors: issuesForRenderError(result.error) } : {}),
        }
      })
  )

  server.registerTool(
    "lumenclip_render_get",
    {
      title: "Get a render",
      description: "Returns a render's status, slide URLs, warnings and the frozen resolved spec.",
      inputSchema: { renderId: z.string().min(1).describe("Render id from lumenclip_slideshow_render.") },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const render = await repos().renders.get(workspaceId, input.renderId)
        if (!render) throw new DataNotFoundError("render", input.renderId)
        return { render: renderView(render, services.apiBaseUrl(), { includeSpec: true }) }
      })
  )
}

// ─────────────────────────────── collections ───────────────────────────────

function collectionSummary(collection: Collection) {
  return {
    id: collection.id,
    name: collection.name,
    mediaKind: collection.mediaKind,
    pinned: collection.pinned,
    itemCount: collection.itemCount,
    coverMediaId: collection.coverMediaId,
    deletedAt: collection.deletedAt,
    updatedAt: collection.updatedAt,
  }
}

function registerCollectionTools(server: McpServer, ctx: ToolContext) {
  const { services, workspaceId } = ctx
  const repos = () => services.repositories()

  server.registerTool(
    "lumenclip_collections_list",
    {
      title: "List image collections",
      description:
        "Lists image collections. Use a collection's id or exact name in image slots as {collection, pick}.",
      inputSchema: {
        includeDeleted: z.boolean().default(false).describe("Include collections in the 30-day trash."),
        ...cursorInput,
      },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const page = await repos().collections.list(workspaceId, {
          includeDeleted: input.includeDeleted,
          cursor: input.cursor,
          limit: input.limit,
        })
        return { collections: page.items.map(collectionSummary), nextCursor: page.nextCursor }
      })
  )

  server.registerTool(
    "lumenclip_assets_list",
    {
      title: "List images",
      description:
        "Lists images in a collection, in the uploads library (collectionId \"uploads\"), or everywhere. Use an image id in slots as {media: id}.",
      inputSchema: {
        collectionId: z.string().optional().describe('Collection id, or "uploads" for unfiled images.'),
        ...cursorInput,
      },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const page = await repos().media.list(workspaceId, {
          cursor: input.cursor,
          limit: input.limit,
          ...(input.collectionId === undefined
            ? {}
            : { collectionId: input.collectionId === "uploads" ? null : input.collectionId }),
        })
        const base = services.apiBaseUrl()
        return {
          assets: page.items.map((m) => ({ ...mediaView(m), url: `${base}/media/${m.id}/file` })),
          nextCursor: page.nextCursor,
        }
      })
  )

  server.registerTool(
    "lumenclip_collection_save",
    {
      title: "Create or update an image collection",
      description:
        "Creates a collection by name, or renames/pins an existing one when collectionId is given. Collection names are unique.",
      inputSchema: {
        collectionId: z.string().optional().describe("Existing collection to update."),
        name: z.string().trim().min(1).max(128).optional().describe('Collection name, e.g. "Bedroom aesthetic".'),
        pinned: z.boolean().optional(),
        requestId: z.string().optional().describe("Echoed back for client correlation."),
      },
      annotations: WRITE,
    },
    async (input) =>
      run(async () => {
        const r = repos()
        let collection: Collection
        let created = false
        if (input.collectionId) {
          const existing = await r.collections.get(workspaceId, input.collectionId)
          if (!existing) throw new DataNotFoundError("collection", input.collectionId)
          collection = existing
          if (input.name && input.name !== existing.name) {
            collection = await r.collections.rename(workspaceId, existing.id, input.name)
          }
          if (existing.deletedAt) collection = await r.collections.restore(workspaceId, existing.id)
        } else {
          if (!input.name) throw new McpInputError("Give the collection a name.")
          const existing = await r.collections.getByName(workspaceId, input.name)
          if (existing) {
            collection = existing.deletedAt ? await r.collections.restore(workspaceId, existing.id) : existing
          } else {
            collection = await r.collections.create(workspaceId, {
              name: input.name,
              mediaKind: "image",
              createdBy: workspaceId,
            })
            created = true
          }
        }
        if (input.pinned !== undefined && input.pinned !== collection.pinned) {
          collection = await r.collections.setPinned(workspaceId, collection.id, input.pinned)
        }
        return { requestId: input.requestId ?? null, created, collection: collectionSummary(collection) }
      })
  )

  server.registerTool(
    "lumenclip_collection_add_assets",
    {
      title: "Add images to a collection from URLs",
      description:
        "Downloads public image URLs (http/https, at most 25 MB each, png/jpeg/webp/gif/avif) into a collection. Private-network URLs are refused. Identical images are not duplicated.",
      inputSchema: {
        collectionId: z.string().min(1).describe("Target collection id."),
        urls: z.array(z.string().url()).min(1).max(20).describe("Public image URLs."),
      },
      annotations: { ...WRITE, openWorldHint: true },
    },
    async (input) =>
      run(async () => {
        const r = repos()
        const collection = await r.collections.get(workspaceId, input.collectionId)
        if (!collection || collection.deletedAt) throw new DataNotFoundError("collection", input.collectionId)
        const added: unknown[] = []
        const failed: { url: string; error: string }[] = []
        for (const url of input.urls) {
          try {
            const { media, created } = await importMediaFromUrl(
              r,
              workspaceId,
              { url, collectionId: collection.id, createdBy: workspaceId },
              services.remoteFetch
            )
            added.push({ ...mediaView(media), created })
          } catch (error) {
            failed.push({ url, error: error instanceof Error ? error.message : "Import failed" })
          }
        }
        const updated = await r.collections.get(workspaceId, collection.id)
        return { collection: collectionSummary(updated ?? collection), added, failed }
      })
  )

  server.registerTool(
    "lumenclip_collection_delete",
    {
      title: "Delete an image collection",
      description:
        "Moves a collection to the 30-day trash. Renders already made keep their images. Requires confirm=true.",
      inputSchema: {
        collectionId: z.string().min(1),
        confirm: z.literal(true).describe("Must be true."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) =>
      run(async () => {
        await repos().collections.softDelete(workspaceId, input.collectionId)
        return { deleted: true, collectionId: input.collectionId, restorableForDays: 30 }
      })
  )
}

// ─────────────────────────────── outputs + operations ───────────────────────────────

function jobSummary(job: Job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    payload: job.payload,
    result: job.result,
    error: job.error,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  }
}

function registerOutputTools(server: McpServer, ctx: ToolContext) {
  const { services, workspaceId } = ctx
  const repos = () => services.repositories()

  server.registerTool(
    "lumenclip_outputs_list",
    {
      title: "List rendered outputs",
      description: "Lists renders (outputs), newest first, with slide URLs.",
      inputSchema: {
        status: z.enum(["queued", "rendering", "succeeded", "failed"]).optional(),
        ...cursorInput,
      },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const page = await repos().renders.list(workspaceId, {
          status: input.status,
          cursor: input.cursor,
          limit: input.limit,
        })
        const base = services.apiBaseUrl()
        return { outputs: page.items.map((r) => renderView(r, base)), nextCursor: page.nextCursor }
      })
  )

  server.registerTool(
    "lumenclip_output_get",
    {
      title: "Get a rendered output",
      description: "Returns one render with its slide URLs, resolved spec and the posts created from it.",
      inputSchema: { outputId: z.string().min(1).describe("Render id.") },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const r = repos()
        const render = await r.renders.get(workspaceId, input.outputId)
        if (!render) throw new DataNotFoundError("render", input.outputId)
        const posts = await r.posts.listByRender(workspaceId, render.id)
        return {
          output: renderView(render, services.apiBaseUrl(), { includeSpec: true }),
          posts: posts.map(postView),
        }
      })
  )

  server.registerTool(
    "lumenclip_output_delete",
    {
      title: "Delete a rendered output",
      description:
        "Deletes a render. Refused while it has scheduled or publishing posts. Requires confirm=true.",
      inputSchema: { outputId: z.string().min(1), confirm: z.literal(true).describe("Must be true.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) =>
      run(async () => {
        const r = repos()
        const render = await r.renders.get(workspaceId, input.outputId)
        if (!render) throw new DataNotFoundError("render", input.outputId)
        const posts = await r.posts.listByRender(workspaceId, render.id)
        if (posts.some((p) => p.status === "scheduled" || p.status === "publishing")) {
          throw new McpInputError("Cancel this output's scheduled posts before deleting it.")
        }
        await r.renders.softDelete(workspaceId, render.id)
        return { deleted: true, outputId: render.id }
      })
  )

  server.registerTool(
    "lumenclip_operations_list",
    {
      title: "List background operations",
      description: "Lists this workspace's background jobs (queued renders, publishing), newest first.",
      inputSchema: cursorInput,
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const page = await repos().jobs.listForWorkspace(workspaceId, { cursor: input.cursor, limit: input.limit })
        return { operations: page.items.map(jobSummary), nextCursor: page.nextCursor }
      })
  )

  server.registerTool(
    "lumenclip_operation_get",
    {
      title: "Get a background operation",
      description: "Returns one background job's status, attempts, result and error.",
      inputSchema: { operationId: z.string().min(1).describe("Job id, e.g. from lumenclip_slideshow_render.") },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const job = await repos().jobs.get(workspaceId, input.operationId)
        if (!job) throw new DataNotFoundError("operation", input.operationId)
        return { operation: jobSummary(job) }
      })
  )
}

// ─────────────────────────────── publishing ───────────────────────────────

function registerPublishingTools(server: McpServer, ctx: ToolContext) {
  const { services, workspaceId } = ctx
  const repos = () => services.repositories()

  server.registerTool(
    "lumenclip_accounts_list",
    {
      title: "List publishing accounts",
      description:
        'Lists the SocialBu accounts renders can be published to. Returns connected=false with "SocialBu not connected" when publishing is not configured.',
      inputSchema: {},
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const publisher = services.publisher()
        if (!publisher.configured) return { connected: false, message: PUBLISHER_NOT_CONNECTED_MESSAGE, accounts: [] }
        const accounts = await listPublishableAccounts(repos(), publisher, workspaceId)
        return {
          connected: true,
          message: null,
          accounts: accounts.map(({ id, provider, name, active }) => ({ id, provider, name, active })),
        }
      })
  )

  server.registerTool(
    "lumenclip_output_publish",
    {
      title: "Publish or schedule a rendered output",
      description:
        "Uploads a succeeded render's slides to SocialBu and publishes them as a photo/carousel post to each account, now or at publishAt. Repeat-safe with idempotencyKey. Only call after the user confirms the accounts, caption and time.",
      inputSchema: {
        outputId: z.string().min(1).describe("Render id."),
        accountIds: z.array(z.string().min(1)).min(1).max(20).describe("SocialBu account ids from lumenclip_accounts_list."),
        caption: z.string().max(5000).default(""),
        publishAt: z.iso.datetime({ offset: true })
          .optional()
          .describe('ISO time with offset, e.g. "2026-10-10T18:00:00+08:00". Omit to publish now.'),
        platformOptions: z
          .record(z.string(), z.record(z.string(), z.unknown()))
          .optional()
          .describe('SocialBu options per provider, e.g. {"tiktok": {"privacy_status": "PUBLIC_TO_EVERYONE"}}.'),
        idempotencyKey: z.string().min(1).max(128).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) =>
      run(async () => {
        const result = await scheduleRenderPost(
          repos(),
          services.publisher(),
          workspaceId,
          stripUndefined({
            renderId: input.outputId,
            accountIds: input.accountIds,
            caption: input.caption,
            publishAt: input.publishAt,
            platformOptions: input.platformOptions,
            idempotencyKey: input.idempotencyKey,
          }),
          { createdBy: workspaceId, now: services.now }
        )
        return { posts: result.posts.map(postView) }
      })
  )

  server.registerTool(
    "lumenclip_output_mark_published",
    {
      title: "Record a manual publication",
      description:
        "Records that a render was published outside LumenClip (e.g. posted by hand), so it shows on the calendar. Does not post anything.",
      inputSchema: {
        outputId: z.string().min(1).describe("Render id."),
        provider: z.string().min(1).describe('Network, e.g. "tiktok" or "instagram".'),
        accountId: z.string().min(1).default("manual").describe("SocialBu account id, or \"manual\"."),
        permalink: z.string().url().optional(),
        publishedAt: z.iso.datetime({ offset: true }).optional().describe("Defaults to now."),
        caption: z.string().max(5000).default(""),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) =>
      run(async () => {
        const r = repos()
        const render = await r.renders.get(workspaceId, input.outputId)
        if (!render) throw new DataNotFoundError("render", input.outputId)
        const publishedAt = (input.publishedAt ? new Date(input.publishedAt) : services.now()).toISOString()
        const { value } = await r.posts.upsertIntent(workspaceId, {
          renderId: render.id,
          provider: input.provider,
          accountId: input.accountId,
          status: "publishing",
          publishAt: publishedAt,
          caption: input.caption,
          intentKey: `manual:${render.id}:${input.provider}:${input.accountId}`,
          createdBy: workspaceId,
        })
        const post = await r.posts.update(workspaceId, value.id, {
          status: "published",
          publishedAt,
          permalink: input.permalink ?? value.permalink,
        })
        return { post: postView(post) }
      })
  )
}

// ─────────────────────────────── schedule ───────────────────────────────

function registerScheduleTools(server: McpServer, ctx: ToolContext) {
  const { services, workspaceId } = ctx
  const repos = () => services.repositories()

  server.registerTool(
    "lumenclip_schedule_get",
    {
      title: "Check the publishing schedule",
      description:
        "Returns scheduled, publishing, published, failed and canceled posts in a time window, with their render titles. Never publishes.",
      inputSchema: {
        from: z.iso.datetime({ offset: true })
          .optional()
          .describe('Window start with offset, e.g. "2026-10-09T09:00:00+08:00". Defaults to now.'),
        days: z.number().int().min(1).max(90).default(14).describe("Days to include, e.g. 14."),
      },
      annotations: READ_ONLY,
    },
    async (input) =>
      run(async () => {
        const r = repos()
        const from = input.from ? new Date(input.from) : services.now()
        const to = new Date(from.getTime() + input.days * 86_400_000)
        const posts = await r.posts.listRange(workspaceId, { from: from.toISOString(), to: to.toISOString() })
        const titles = new Map<string, string | null>()
        for (const post of posts) {
          if (!titles.has(post.renderId)) {
            titles.set(post.renderId, (await r.renders.get(workspaceId, post.renderId))?.title ?? null)
          }
        }
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          items: posts.map((p) => ({ ...postView(p), renderTitle: titles.get(p.renderId) ?? null })),
        }
      })
  )
}

// ─────────────────────────────── plumbing ───────────────────────────────

class McpInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "McpInputError"
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}

function toolError(message: string, details?: Record<string, unknown>) {
  const payload = { error: message, ...details }
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  }
}

/** Runs a tool body; known failures become `isError` results with a readable message. */
async function run(task: () => Promise<Record<string, unknown>>) {
  try {
    const value = await task()
    return {
      content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
      structuredContent: value,
    }
  } catch (error) {
    if (error instanceof RenderRequestError) {
      return toolError(error.status === 404 ? error.message : "The spec or slot values are invalid.", {
        errors: error.errors,
        warnings: error.warnings,
      })
    }
    if (error instanceof PublisherNotConfiguredError) return toolError(PUBLISHER_NOT_CONNECTED_MESSAGE)
    if (error instanceof PublisherRequestError) return toolError(`SocialBu: ${error.message}`)
    if (
      error instanceof PublishRequestError ||
      error instanceof MediaInputError ||
      error instanceof McpInputError ||
      error instanceof DataNotFoundError ||
      error instanceof DataConflictError
    ) {
      return toolError(error.message)
    }
    throw error
  }
}
