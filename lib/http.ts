type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchLike = typeof fetch

export type FetchTimeoutOptions = {
  timeoutMs?: number
  fetchImpl?: FetchLike
}

export type FetchJsonOptions = FetchTimeoutOptions & {
  bodySnippetLength?: number
  errorMessage?: (response: Response, payload: unknown) => string
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_BODY_SNIPPET_LENGTH = 300

export async function fetchWithTimeout(
  url: FetchInput,
  init?: FetchInit,
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }: FetchTimeoutOptions = {}
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal

  return fetchImpl(url, {
    ...init,
    signal,
  })
}

export async function fetchJson<T = unknown>(
  url: FetchInput,
  init?: FetchInit,
  options: FetchJsonOptions = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, init, options)
  const text = await response.text().catch(() => "")

  let payload: T
  try {
    payload = JSON.parse(text) as T
  } catch {
    if (!response.ok) {
      throw buildHttpError(response, text, options, null)
    }
    const snippet = truncateBodySnippet(
      text,
      options.bodySnippetLength ?? DEFAULT_BODY_SNIPPET_LENGTH
    )
    throw new Error(
      `Expected JSON response from ${String(url)} but could not parse body${
        snippet ? `: ${snippet}` : ""
      }`
    )
  }

  if (!response.ok) {
    throw buildHttpError(response, text, options, payload)
  }
  return payload
}

function buildHttpError(
  response: Response,
  text: string,
  options: FetchJsonOptions,
  payload: unknown
) {
  const customMessage = options.errorMessage?.(response, payload)
  if (customMessage) {
    return new Error(customMessage)
  }

  const statusText = response.statusText ? ` ${response.statusText}` : ""
  const snippet = truncateBodySnippet(
    text,
    options.bodySnippetLength ?? DEFAULT_BODY_SNIPPET_LENGTH
  )
  return new Error(
    `HTTP request failed with ${response.status}${statusText}${
      snippet ? `: ${snippet}` : ""
    }`
  )
}

function truncateBodySnippet(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return ""
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength))}...`
}
