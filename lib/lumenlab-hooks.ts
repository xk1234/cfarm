import "server-only"

import { clean, isRecord } from "@/lib/guards"
import type {
  LumenLabHookSummary,
  LumenLabProjectHooksResponse,
  LumenLabProjectScriptAnalysisResponse,
  LumenLabProjectSummary,
  LumenLabProjectsResponse,
} from "@/lib/lumenlab-hook-contract"

type LumenLabConnection = {
  baseUrl: string
  accessToken: string
}

export function normalizeLumenLabBaseUrl(value: string) {
  const url = new URL(value.trim())
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LumenLab URL must use http or https.")
  }
  if (url.username || url.password) {
    throw new Error("LumenLab URL cannot contain credentials.")
  }
  url.pathname = ""
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

function configuredConnection(): LumenLabConnection {
  const baseUrl = clean(process.env.LUMENLAB_URL)
  const accessToken = clean(process.env.LUMENLAB_INTEGRATION_TOKEN)
  if (!baseUrl || !accessToken) {
    throw new Error("LumenLab hook import is not configured.")
  }
  return { baseUrl: normalizeLumenLabBaseUrl(baseUrl), accessToken }
}

async function lumenLabRequest(
  path: string,
  fetchImpl: typeof fetch = fetch,
  options: { method?: "GET" | "POST"; timeoutMs?: number } = {}
): Promise<unknown> {
  const connection = configuredConnection()
  const response = await fetchImpl(`${connection.baseUrl}${path}`, {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error =
      isRecord(payload?.error) && clean(payload.error.message)
        ? clean(payload.error.message)
        : `LumenLab returned ${response.status}.`
    throw new Error(error)
  }
  return payload
}

function project(value: unknown): LumenLabProjectSummary | null {
  if (!isRecord(value)) return null
  const id = clean(value.id)
  const title = clean(value.title)
  const updatedAt = clean(value.updatedAt)
  return id && title && updatedAt ? { id, title, updatedAt } : null
}

function hook(value: unknown): LumenLabHookSummary | null {
  if (!isRecord(value)) return null
  const id = clean(value.id)
  const text = clean(value.text)
  const createdAt = clean(value.createdAt)
  if (!id || !text || !createdAt) return null
  return {
    id,
    text,
    createdAt,
    mechanisms: Array.isArray(value.mechanisms)
      ? value.mechanisms.map(clean).filter(Boolean)
      : [],
    sourceType:
      value.sourceType === "script" || value.sourceType === "hook"
        ? value.sourceType
        : undefined,
    sourceId: clean(value.sourceId) || undefined,
    sourceTitle: clean(value.sourceTitle) || null,
    contentDirection: clean(value.contentDirection) || undefined,
    content: clean(value.content) || undefined,
  }
}

export async function fetchLumenLabProjects(fetchImpl: typeof fetch = fetch) {
  const payload = await lumenLabRequest(
    "/api/integrations/lumenclip/projects",
    fetchImpl
  )
  if (!isRecord(payload) || !Array.isArray(payload.projects)) {
    throw new Error("LumenLab returned an invalid projects response.")
  }
  return {
    projects: payload.projects
      .map(project)
      .filter((item): item is LumenLabProjectSummary => Boolean(item)),
  } satisfies LumenLabProjectsResponse
}

export async function fetchLumenLabProjectHooks(
  projectId: string,
  fetchImpl: typeof fetch = fetch
) {
  const id = clean(projectId)
  if (!id) throw new Error("A LumenLab project is required.")
  const payload = await lumenLabRequest(
    `/api/integrations/lumenclip/projects/${encodeURIComponent(id)}/hooks`,
    fetchImpl
  )
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.hooks) ||
    !project(payload.project)
  ) {
    throw new Error("LumenLab returned an invalid hooks response.")
  }
  const hooks = payload.hooks
    .map(hook)
    .filter((item): item is LumenLabHookSummary => Boolean(item))
  return {
    project: project(payload.project)!,
    hooks,
    total: hooks.length,
  } satisfies LumenLabProjectHooksResponse
}

export async function analyzeLumenLabProjectScripts(
  projectId: string,
  fetchImpl: typeof fetch = fetch
) {
  const id = clean(projectId)
  if (!id) throw new Error("A LumenLab project is required.")
  const payload = await lumenLabRequest(
    `/api/integrations/lumenclip/projects/${encodeURIComponent(id)}/analyze-scripts`,
    fetchImpl,
    { method: "POST", timeoutMs: 120_000 }
  )
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.hooks) ||
    !project(payload.project) ||
    !isRecord(payload.analysis)
  ) {
    throw new Error("LumenLab returned an invalid script analysis response.")
  }
  const hooks = payload.hooks
    .map(hook)
    .filter((item): item is LumenLabHookSummary => Boolean(item))
  return {
    project: project(payload.project)!,
    scriptCount: Number(payload.scriptCount) || hooks.length,
    projectContentDirection: clean(payload.projectContentDirection),
    projectContent: clean(payload.projectContent),
    hooks,
    analysis: {
      model: clean(payload.analysis.model),
      tokensIn: Number(payload.analysis.tokensIn) || 0,
      tokensOut: Number(payload.analysis.tokensOut) || 0,
      costUsd: Number(payload.analysis.costUsd) || 0,
    },
  } satisfies LumenLabProjectScriptAnalysisResponse
}
