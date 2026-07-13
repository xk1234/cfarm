import { toast } from "sonner"

const DEFAULT_TIMEOUT_MS = 30_000
const TIMEOUT_MESSAGE = "Request timed out. Please try again."
const FALLBACK_ERROR_MESSAGE = "Request failed. Please try again."

type JsonPayload = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined

export class ApiRequestError extends Error {
  status?: number
  timedOut: boolean

  constructor(message: string, options: { status?: number; timedOut?: boolean } = {}) {
    super(message)
    this.name = "ApiRequestError"
    this.status = options.status
    this.timedOut = options.timedOut ?? false
  }
}

export type FetchJsonOptions = RequestInit & {
  timeoutMs?: number
  toastOnError?: boolean
}

export async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, toastOnError = true, ...requestInit } = options
  const controller = new AbortController()
  let timedOut = false

  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true })
    }
  }

  try {
    const response = await fetch(input, { ...requestInit, signal: controller.signal })
    const payload = await readJsonPayload(response)

    if (!response.ok) {
      throw new ApiRequestError(extractApiErrorMessage(payload) ?? `Request failed with status ${response.status}`, {
        status: response.status,
      })
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiRequestError) {
      showApiErrorToast(error, toastOnError)
      throw error
    }

    if (isAbortError(error)) {
      const abortError = new ApiRequestError(timedOut ? TIMEOUT_MESSAGE : "Request was cancelled.", { timedOut })
      showApiErrorToast(abortError, toastOnError)
      throw abortError
    }

    const requestError = new ApiRequestError(getApiErrorMessage(error, FALLBACK_ERROR_MESSAGE))
    showApiErrorToast(requestError, toastOnError)
    throw requestError
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export function getApiErrorMessage(error: unknown, fallback = FALLBACK_ERROR_MESSAGE) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

/** Show an error toast for a failed API call using the parsed API error message. */
export function toastApiError(error: unknown, fallback?: string) {
  toast.error(getApiErrorMessage(error, fallback))
}

async function readJsonPayload(response: Response): Promise<JsonPayload> {
  const text = await response.text().catch(() => "")
  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as JsonPayload
  } catch {
    return text
  }
}

function extractApiErrorMessage(payload: JsonPayload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined
  }

  const error = payload.error
  if (typeof error === "string" && error.trim()) {
    return error
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message
  }

  if ("message" in payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message
  }

  return undefined
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError"
}

function showApiErrorToast(error: ApiRequestError, enabled: boolean) {
  if (enabled && error.message.trim()) {
    toast.error(error.message)
  }
}
