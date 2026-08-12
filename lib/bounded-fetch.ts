import "server-only"

import { assertPublicHttpUrl } from "@/lib/url-guard"

export class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Remote response exceeded ${maxBytes} bytes`)
    this.name = "PayloadTooLargeError"
  }
}

export async function fetchPublicResource(
  rawUrl: string,
  options: {
    headers?: HeadersInit
    timeoutMs?: number
    maxRedirects?: number
    trustedHosts?: string[]
    fetchImpl?: typeof fetch
  } = {}
): Promise<Response> {
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 20_000)
  const maxRedirects = Math.max(0, options.maxRedirects ?? 3)
  let url = new URL(rawUrl)
  for (let redirect = 0; ; redirect += 1) {
    if (!options.trustedHosts?.includes(url.hostname)) {
      url = await assertPublicHttpUrl(url.toString())
    }
    const response = await (options.fetchImpl ?? fetch)(url, {
      redirect: "manual",
      headers: options.headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!isRedirect(response.status)) return response
    if (redirect >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error("Too many remote media redirects")
    }
    const location = response.headers.get("location")
    await response.body?.cancel().catch(() => undefined)
    if (!location) throw new Error("Remote media redirect had no location")
    url = new URL(location, url)
  }
}

export async function readResponseBytes(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const boundedMax = Math.max(1, Math.floor(maxBytes))
  const contentLength = Number(response.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > boundedMax) {
    await response.body?.cancel().catch(() => undefined)
    throw new PayloadTooLargeError(boundedMax)
  }
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > boundedMax) {
        await reader.cancel().catch(() => undefined)
        throw new PayloadTooLargeError(boundedMax)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

function isRedirect(status: number) {
  return status >= 300 && status < 400
}
