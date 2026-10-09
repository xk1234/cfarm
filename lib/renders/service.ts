/**
 * Render service shared by `/api/v1`, the in-app routes, MCP and the worker's
 * `render-slideshow` job handler. It codes against the frozen engine and
 * repository contracts only, so tests run on memory repositories with a fake
 * `renderSpec`.
 */
import JSZip from "jszip"

import {
  DataNotFoundError,
  sha256Hex,
  type Render,
  type RenderOutputSlide,
  type RenderSource,
  type RenderSummary,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"
import {
  AssetLoadError,
  ENGINE_VERSION,
  RenderError,
  type AssetLoader,
  type RenderOptions,
  type RenderResult,
} from "@/lib/render/engine"
import {
  canonicalJson,
  RenderRequestSchema,
  resolveTemplate,
  SpecError,
  validateSpec,
  type RenderRequest,
  type ResolvedSpec,
  type SlideshowSpec,
  type SpecIssue,
} from "@/lib/render/spec"

import { createServerAssetLoader } from "./assets"
import { collectionMediaIds } from "./media"
import { getStarterTemplate, isStarterTemplateId } from "./starters"

/** Renders at or below these limits run inline; bigger ones go to the worker. */
export const SYNC_RENDER_MAX_SLIDES = 10
export const SYNC_RENDER_MAX_SCALE = 2
export const DEFAULT_RENDER_QUALITY = 0.92

export type RenderEngine = (resolved: ResolvedSpec, options: RenderOptions) => Promise<RenderResult>

export type RenderServiceDeps = {
  repos: Repositories
  renderSpec: RenderEngine
  /** Defaults to the ownership-checked server loader. */
  assetLoader?: (workspaceId: WorkspaceId) => AssetLoader
}

/** A request problem with an HTTP status and structured spec issues. */
export class RenderRequestError extends Error {
  readonly status: number
  readonly errors: SpecIssue[]
  readonly warnings: SpecIssue[]
  constructor(status: number, errors: SpecIssue[], warnings: SpecIssue[] = [], message?: string) {
    super(message ?? (errors.map((e) => `${e.path || "/"} ${e.message}`).join("; ") || "Invalid render request"))
    this.name = "RenderRequestError"
    this.status = status
    this.errors = errors
    this.warnings = warnings
  }
}

/** Maps a spec/asset issue list to the doc 01 §4 status: 413 size, 424 asset fetch, else 422. */
export function statusForIssues(issues: readonly SpecIssue[]): number {
  if (issues.some((i) => i.code === "limits.spec_size")) return 413
  if (issues.some((i) => i.code === "asset.fetch_failed")) return 424
  return 422
}

// ─────────────────────────────── templates ───────────────────────────────

/** A starter or stored template's spec, or null when unknown/not owned. */
export async function loadTemplateSpec(
  repos: Repositories,
  workspaceId: WorkspaceId,
  templateId: string
): Promise<{ id: string; name: string; spec: SlideshowSpec } | null> {
  if (isStarterTemplateId(templateId)) {
    const starter = getStarterTemplate(templateId)
    return starter ? { id: starter.id, name: starter.name, spec: starter.spec } : null
  }
  const template = await repos.templates.get(workspaceId, templateId)
  return template ? { id: template.id, name: template.name, spec: template.spec } : null
}

// ─────────────────────────────── request parsing ───────────────────────────────

/** Accepts `slots` as an alias of `slotValues` and parses with `RenderRequestSchema`. */
export function parseRenderRequest(input: unknown): RenderRequest {
  let body = input
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const { slots, ...rest } = body as Record<string, unknown>
    if (slots !== undefined && rest.slotValues === undefined) rest.slotValues = slots
    body = rest
  }
  const parsed = RenderRequestSchema.safeParse(body)
  if (parsed.success) return parsed.data
  // Prefer the spec validator's issues (they carry stable codes and JSON pointers).
  const spec = (body as { spec?: unknown } | null)?.spec
  if (spec !== undefined) {
    const result = validateSpec(spec)
    if (!result.ok) {
      throw new RenderRequestError(
        statusForIssues(result.errors),
        result.errors.map((e) => ({ ...e, path: `/spec${e.path}` })),
        result.warnings
      )
    }
  }
  throw new RenderRequestError(
    422,
    parsed.error.issues.map((issue) => ({
      code: `schema.${issue.code}` as const,
      path: issue.path.length ? "/" + issue.path.map(String).join("/") : "",
      message: issue.message,
    }))
  )
}

export function renderHashFor(resolved: ResolvedSpec, output: { format: string; scale: number; quality?: number }) {
  return "sha256:" + sha256Hex(canonicalJson({ spec: resolved, engine: ENGINE_VERSION, output }))
}

/** Resolves a render request (template + slot values, or a spec) to a frozen ResolvedSpec. */
export async function resolveRenderRequest(
  repos: Repositories,
  workspaceId: WorkspaceId,
  request: RenderRequest
): Promise<{ resolved: ResolvedSpec; templateId: string | null; title: string | null }> {
  let spec: SlideshowSpec
  let templateId: string | null = null
  let title = request.title ?? null
  if (request.templateId) {
    const template = await loadTemplateSpec(repos, workspaceId, request.templateId)
    if (!template) {
      throw new RenderRequestError(404, [
        { code: "slot.unknown", path: "/templateId", message: `Template ${request.templateId} was not found.` },
      ], [], "Template not found")
    }
    spec = template.spec
    templateId = template.id
    title ??= template.name
  } else {
    spec = request.spec as SlideshowSpec
    title ??= spec.name ?? null
  }
  try {
    const resolved = await resolveTemplate(spec, request.slotValues ?? {}, {
      resolveCollection: (ref) => collectionMediaIds(repos, workspaceId, ref),
      seed: request.idempotencyKey,
    })
    return { resolved, templateId, title }
  } catch (error) {
    if (error instanceof SpecError) {
      throw new RenderRequestError(statusForIssues(error.errors), error.errors, error.warnings)
    }
    throw error
  }
}

// ─────────────────────────────── create + execute ───────────────────────────────

export type CreateRenderContext = {
  source: RenderSource
  createdBy: string
  apiKeyId?: string | null
}

export type CreateRenderResult = {
  render: Render
  /** false when an earlier render with the same idempotency key was returned. */
  created: boolean
  /** true when the render should run inline (small enough and not `wait: false`). */
  sync: boolean
  quality?: number
}

export function shouldRenderSync(render: Pick<Render, "slideCount" | "scale">, wait: boolean | undefined) {
  if (wait === false) return false
  return render.slideCount <= SYNC_RENDER_MAX_SLIDES && render.scale <= SYNC_RENDER_MAX_SCALE
}

/** Validates, resolves and records a render (status `queued`). Does not render. */
export async function createRender(
  repos: Repositories,
  workspaceId: WorkspaceId,
  input: unknown,
  context: CreateRenderContext
): Promise<CreateRenderResult> {
  const request = parseRenderRequest(input)
  // Collection picks are seeded by the idempotency key, so resolving a replay
  // gives the same spec; the repository returns the existing row.
  const { resolved, templateId, title } = await resolveRenderRequest(repos, workspaceId, request)
  const format = request.output?.format ?? "png"
  const scale = request.output?.scale ?? 1
  const { value: render, created } = await repos.renders.create(workspaceId, {
    templateId,
    slotValues: request.templateId || request.slotValues ? (request.slotValues ?? {}) : null,
    spec: resolved,
    source: context.source,
    apiKeyId: context.apiKeyId ?? null,
    idempotencyKey: request.idempotencyKey ?? null,
    title,
    format,
    scale,
    renderHash: renderHashFor(resolved, { format, scale, quality: request.output?.quality }),
    createdBy: context.createdBy,
  })
  return {
    render,
    created,
    sync: created && shouldRenderSync(render, request.wait),
    quality: request.output?.quality,
  }
}

export function slideFileId(renderId: string, index: number): string {
  return `${renderId}-${String(index).padStart(2, "0")}`
}

export type ExecuteRenderResult = { render: Render; error: unknown | null }

/**
 * Renders a recorded render and stores one file per slide in the `renders`
 * bucket (`<renderId>-NN`, overwritten on retry). Marks the row succeeded or
 * failed; never throws for render/asset problems (returns them in `error`).
 */
export async function executeRender(
  deps: RenderServiceDeps,
  workspaceId: WorkspaceId,
  renderId: string,
  options: { jobId?: string | null; quality?: number } = {}
): Promise<ExecuteRenderResult> {
  const { repos } = deps
  const existing = await repos.renders.get(workspaceId, renderId)
  if (!existing) throw new DataNotFoundError("render", renderId)
  if (existing.status === "succeeded" && existing.output) return { render: existing, error: null }
  await repos.renders.markRendering(workspaceId, renderId, options.jobId ?? undefined)
  try {
    const assets = deps.assetLoader ? deps.assetLoader(workspaceId) : createServerAssetLoader(repos, workspaceId)
    const result = await deps.renderSpec(existing.spec, {
      format: existing.format,
      scale: existing.scale,
      quality: existing.format === "png" ? undefined : (options.quality ?? DEFAULT_RENDER_QUALITY),
      assets,
    })
    const slides: RenderOutputSlide[] = []
    for (const slide of result.slides) {
      const fileId = slideFileId(renderId, slide.index)
      await repos.blobs.put(workspaceId, "renders", fileId, slide.bytes, slide.mime)
      slides.push({
        index: slide.index,
        slideId: slide.id,
        fileId,
        mime: slide.mime,
        sizeBytes: slide.bytes.byteLength,
        width: slide.width,
        height: slide.height,
        sha256: sha256Hex(slide.bytes),
      })
    }
    slides.sort((a, b) => a.index - b.index)
    const render = await repos.renders.markSucceeded(
      workspaceId,
      renderId,
      { slides, coverFileId: slides[0]?.fileId ?? null, zipFileId: null },
      result.warnings
    )
    return { render, error: null }
  } catch (error) {
    const render = await repos.renders.markFailed(workspaceId, renderId, renderErrorMessage(error))
    return { render, error }
  }
}

export function renderErrorMessage(error: unknown): string {
  if (error instanceof RenderError || error instanceof SpecError) {
    return error.message || "Render failed"
  }
  if (error instanceof AssetLoadError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : "Render failed"
}

/** Issues describing a failed execution, for API error bodies. */
export function issuesForRenderError(error: unknown): SpecIssue[] {
  if (error instanceof RenderError) return error.issues
  if (error instanceof SpecError) return error.errors
  if (error instanceof AssetLoadError) return [{ code: error.code, path: "", message: error.message }]
  return [{ code: "schema.custom", path: "", message: renderErrorMessage(error) }]
}

/** Enqueues the worker job for an async render (deduped per render). */
export async function enqueueRenderJob(repos: Repositories, workspaceId: WorkspaceId, renderId: string) {
  const { value } = await repos.jobs.enqueue({
    workspaceId,
    type: "render-slideshow",
    payload: { renderId },
    dedupeKey: `render:${renderId}`,
  })
  return value
}

/** Records an in-app notification for a finished async render. */
export async function notifyRenderFinished(repos: Repositories, render: Render) {
  const succeeded = render.status === "succeeded"
  await repos.notifications.schedule(render.workspaceId, {
    event: succeeded ? "render.succeeded" : "render.failed",
    renderId: render.id,
    title: succeeded ? `Render ready: ${render.title ?? render.id}` : `Render failed: ${render.title ?? render.id}`,
    body: succeeded ? `${render.slideCount} slides` : render.error,
    deliverAt: new Date().toISOString(),
    dedupeKey: `render:${render.id}:${render.status}`,
  })
}

// ─────────────────────────────── reading outputs ───────────────────────────────

export async function readRenderSlide(
  repos: Repositories,
  workspaceId: WorkspaceId,
  renderId: string,
  index: number
) {
  const render = await repos.renders.get(workspaceId, renderId)
  const slide = render?.output?.slides.find((s) => s.index === index)
  if (!render || !slide) return null
  const blob = await repos.blobs.get(workspaceId, "renders", slide.fileId)
  return blob ? { render, slide, bytes: blob.bytes, mime: slide.mime } : null
}

export function renderFileSlug(render: Pick<Render, "id" | "title">): string {
  const slug = (render.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug || `render-${render.id}`
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function slideFilename(render: Pick<Render, "id" | "title">, slide: Pick<RenderOutputSlide, "index" | "mime">) {
  return `${renderFileSlug(render)}-${String(slide.index + 1).padStart(2, "0")}.${EXTENSION_BY_MIME[slide.mime] ?? "bin"}`
}

/** ZIP of every rendered slide, built on demand from the `renders` bucket. */
export async function buildRenderZip(repos: Repositories, workspaceId: WorkspaceId, renderId: string) {
  const render = await repos.renders.get(workspaceId, renderId)
  if (!render || render.status !== "succeeded" || !render.output) return null
  const zip = new JSZip()
  for (const slide of render.output.slides) {
    const blob = await repos.blobs.get(workspaceId, "renders", slide.fileId)
    if (!blob) return null
    zip.file(slideFilename(render, slide), blob.bytes)
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" })
  return { render, bytes, filename: `${renderFileSlug(render)}.zip` }
}

/** API view of a render: URLs point at ownership-checked routes under `baseUrl`. */
export function renderView(
  render: RenderSummary & Partial<Pick<Render, "spec" | "slotValues">>,
  baseUrl: string,
  options: { includeSpec?: boolean } = {}
) {
  const root = `${baseUrl.replace(/\/$/, "")}/renders/${render.id}`
  const succeeded = render.status === "succeeded" && !!render.output
  return {
    id: render.id,
    status: render.status,
    source: render.source,
    title: render.title,
    templateId: render.templateId,
    format: render.format,
    scale: render.scale,
    slideCount: render.slideCount,
    width: render.width,
    height: render.height,
    renderHash: render.renderHash,
    slides: (render.output?.slides ?? []).map((slide) => ({
      index: slide.index,
      id: slide.slideId,
      url: `${root}/slides/${slide.index}`,
      mime: slide.mime,
      width: slide.width,
      height: slide.height,
      bytes: slide.sizeBytes,
      sha256: slide.sha256 ?? null,
    })),
    zipUrl: succeeded ? `${root}/zip` : null,
    warnings: render.warnings,
    error: render.error,
    jobId: render.jobId,
    createdAt: render.createdAt,
    completedAt: render.completedAt,
    ...(options.includeSpec && render.spec
      ? { resolvedSpec: render.spec as unknown as Record<string, unknown>, slotValues: render.slotValues ?? null }
      : {}),
  }
}

export type RenderView = ReturnType<typeof renderView>

export type SubmitRenderResult =
  | { mode: "replay"; render: Render; error: null; jobId: string | null }
  | { mode: "sync"; render: Render; error: unknown | null; jobId: null }
  | { mode: "async"; render: Render; error: null; jobId: string }

/**
 * Creates a render, then renders inline when it is small enough
 * (≤ SYNC_RENDER_MAX_SLIDES slides, scale ≤ SYNC_RENDER_MAX_SCALE, `wait` not
 * false) or enqueues a `render-slideshow` job for the worker.
 */
export async function submitRender(
  deps: RenderServiceDeps,
  workspaceId: WorkspaceId,
  input: unknown,
  context: CreateRenderContext
): Promise<SubmitRenderResult> {
  const created = await createRender(deps.repos, workspaceId, input, context)
  if (!created.created) return { mode: "replay", render: created.render, error: null, jobId: created.render.jobId }
  if (created.sync) {
    const { render, error } = await executeRender(deps, workspaceId, created.render.id, { quality: created.quality })
    return { mode: "sync", render, error, jobId: null }
  }
  const job = await enqueueRenderJob(deps.repos, workspaceId, created.render.id)
  return { mode: "async", render: { ...created.render, jobId: job.id }, error: null, jobId: job.id }
}
