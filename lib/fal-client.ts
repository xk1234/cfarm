export class FalProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message)
    this.name = "FalProviderError"
  }
}

type FetchLike = typeof fetch
const FAL_QUEUE = "https://queue.fal.run"

export async function falSubmitAndWait<T>(input: {
  endpoint: string
  input: unknown
  apiKey: string
  requestId?: string
  timeoutMs?: number
  pollDelayMs?: number
  fetchImpl?: FetchLike
}): Promise<T> {
  if (!input.apiKey.trim()) throw new FalProviderError("Missing FAL_KEY", false)
  const fetchImpl = input.fetchImpl ?? fetch
  const endpoint = input.endpoint.replace(/^\/+|\/+$/g, "")
  const headers = { Authorization: `Key ${input.apiKey}`, "Content-Type": "application/json" }
  const submitted = await falJson<{ request_id: string }>(fetchImpl, `${FAL_QUEUE}/${endpoint}`, {
    method: "POST", headers, body: JSON.stringify(input.input),
  })
  const requestId = submitted.request_id || input.requestId
  if (!requestId) throw new FalProviderError("FAL did not return a request id", true)
  const deadline = Date.now() + (input.timeoutMs ?? 600_000)
  for (;;) {
    if (Date.now() >= deadline) throw new FalProviderError("FAL polling timed out", true)
    const status = await falJson<{ status?: string; error?: string }>(fetchImpl, `${FAL_QUEUE}/${endpoint}/requests/${encodeURIComponent(requestId)}/status`, { headers })
    if (status.status === "COMPLETED") break
    if (status.status === "FAILED") throw new FalProviderError(status.error || "FAL request failed", false)
    await delay(input.pollDelayMs ?? 2_000)
  }
  return falJson<T>(fetchImpl, `${FAL_QUEUE}/${endpoint}/requests/${encodeURIComponent(requestId)}`, { headers })
}

export type FalAsset = { url: string; contentType?: string; width?: number; height?: number; durationSeconds?: number; requestId?: string }
export type FalImageInput = Parameters<typeof falSubmitAndWait>[0] & { endpoint: string }
export type FalVideoInput = FalImageInput
export type FalLipSyncInput = FalImageInput

export async function generateFalImage(input: FalImageInput) {
  return normalizeFalAsset(await falSubmitAndWait<Record<string, unknown>>(input), "image")
}
export async function generateFalVideo(input: FalVideoInput) {
  return normalizeFalAsset(await falSubmitAndWait<Record<string, unknown>>(input), "video")
}
export async function lipSyncFalVideo(input: FalLipSyncInput) {
  return generateFalVideo(input)
}

function normalizeFalAsset(payload: Record<string, unknown>, kind: "image" | "video"): FalAsset {
  const candidate = kind === "image" && Array.isArray(payload.images) ? payload.images[0] : payload.video ?? payload.output
  const record = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : payload
  const url = typeof record.url === "string" ? record.url : ""
  if (!/^https:\/\//i.test(url)) throw new FalProviderError(`FAL ${kind} response is missing a secure asset URL`, false)
  return { url, contentType: typeof record.content_type === "string" ? record.content_type : undefined, width: numeric(record.width), height: numeric(record.height), durationSeconds: numeric(record.duration) }
}

async function falJson<T>(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetchImpl(url, init) } catch (cause) { throw new FalProviderError(cause instanceof Error ? cause.message : "FAL network error", true) }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) throw new FalProviderError(String(payload?.detail ?? payload?.message ?? `FAL request failed (${response.status})`), response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500, response.status)
  return payload as T
}
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined
const delay = (ms: number) => ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms))
