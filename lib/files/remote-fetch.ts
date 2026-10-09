/**
 * Guarded download of remote media (Pinterest/Pexels picks, URL imports).
 *
 * - Only http(s); every hop (including redirects, followed manually) must
 *   resolve to a public address (SSRF guard, lib/url-guard.ts). The default
 *   transport is `guardedFetch`, which re-checks at connect time and pins the
 *   socket to the approved address (no DNS-rebinding window).
 * - Hard byte cap enforced while streaming, not just via Content-Length.
 * - Content type must match the requested media kind.
 * - Overall timeout.
 */
import {
  assertPublicHttpUrl,
  BlockedUrlError,
  guardedFetch,
} from "@/lib/url-guard"

export const DEFAULT_REMOTE_MAX_BYTES = 25 * 1024 * 1024

export class RemoteFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RemoteFetchError"
  }
}

export type RemoteMediaKind = "image" | "video" | "any"

export type FetchRemoteMediaOptions = {
  kind?: RemoteMediaKind
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  referer?: string
  /** Single-hop fetch; defaults to the DNS-pinned `guardedFetch`. */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  /** SSRF check per hop; defaults to assertPublicHttpUrl. */
  assertUrl?: (url: string) => Promise<unknown>
}

export type RemoteMedia = { bytes: Uint8Array; mime: string; finalUrl: string }

function mimeMatches(kind: RemoteMediaKind, mime: string): boolean {
  if (kind === "image") return mime.startsWith("image/")
  if (kind === "video") return mime.startsWith("video/")
  return mime.startsWith("image/") || mime.startsWith("video/")
}

async function readCapped(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RemoteFetchError(
      `Remote file is larger than ${Math.floor(maxBytes / 1024 / 1024)} MB`
    )
  }
  if (!response.body)
    return new Uint8Array(await response.arrayBuffer()).slice(0, maxBytes + 1)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new RemoteFetchError(
        `Remote file is larger than ${Math.floor(maxBytes / 1024 / 1024)} MB`
      )
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export async function fetchRemoteMedia(
  rawUrl: string,
  options: FetchRemoteMediaOptions = {}
): Promise<RemoteMedia> {
  const kind = options.kind ?? "image"
  const maxBytes = options.maxBytes ?? DEFAULT_REMOTE_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? 3
  const fetchImpl = options.fetchImpl ?? guardedFetch
  const assertUrl = options.assertUrl ?? assertPublicHttpUrl
  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000)

  let url = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new RemoteFetchError("Invalid media URL")
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new RemoteFetchError("Media URLs must use http or https")
    }
    try {
      await assertUrl(parsed.toString())
    } catch (error) {
      throw new RemoteFetchError(
        error instanceof Error ? error.message : "Media URL is not allowed"
      )
    }
    let response: Response
    try {
      response = await fetchImpl(parsed.toString(), {
        redirect: "manual",
        signal,
        headers: {
          Accept:
            kind === "video"
              ? "video/*"
              : kind === "image"
                ? "image/avif,image/webp,image/*;q=0.9"
                : "image/*,video/*",
          "User-Agent": "Mozilla/5.0 (compatible; LumenClip-media-import/1.0)",
          ...(options.referer ? { Referer: options.referer } : {}),
        },
      })
    } catch (error) {
      if (error instanceof BlockedUrlError)
        throw new RemoteFetchError(error.message)
      throw error
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new RemoteFetchError("Redirect without a location")
      url = new URL(location, parsed).toString()
      continue
    }
    if (!response.ok)
      throw new RemoteFetchError(`Remote server returned ${response.status}`)
    const mime = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    if (!mimeMatches(kind, mime)) {
      throw new RemoteFetchError(
        `Remote file is not ${kind === "video" ? "a video" : kind === "image" ? "an image" : "an image or video"}`
      )
    }
    return {
      bytes: await readCapped(response, maxBytes),
      mime,
      finalUrl: parsed.toString(),
    }
  }
  throw new RemoteFetchError("Too many redirects")
}
