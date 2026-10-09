import "server-only"

import pRetry, { AbortError } from "p-retry"

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504])

export type ProviderFetchOptions = RequestInit & {
  retries?: number
  timeoutMs?: number
}

/** Retry only transient network/provider failures; client errors fail once. */
export function providerFetch(
  input: string | URL,
  options: ProviderFetchOptions = {}
): Promise<Response> {
  const { retries = 2, timeoutMs = 30_000, ...init } = options
  return pRetry(
    async () => {
      let response: Response
      const controller = new AbortController()
      const cancel = () => controller.abort()
      const timeout = globalThis.setTimeout(cancel, timeoutMs)
      init.signal?.addEventListener("abort", cancel, { once: true })
      try {
        response = await fetch(input, {
          ...init,
          signal: controller.signal,
        })
      } catch (error) {
        if (init.signal?.aborted) throw new AbortError("Request cancelled")
        throw error
      } finally {
        globalThis.clearTimeout(timeout)
        init.signal?.removeEventListener("abort", cancel)
      }
      if (retryableStatuses.has(response.status)) {
        const body = await response.arrayBuffer()
        const replayableResponse = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
        throw new RetryableProviderResponse(replayableResponse)
      }
      return response
    },
    {
      retries,
      factor: 2,
      minTimeout: 400,
      maxTimeout: 4_000,
      randomize: true,
    }
  ).catch((error: unknown) => {
    if (error instanceof RetryableProviderResponse) return error.response
    throw error
  })
}

class RetryableProviderResponse extends Error {
  constructor(readonly response: Response) {
    super(`Provider temporarily unavailable (${response.status})`)
    this.name = "RetryableProviderResponse"
  }
}
