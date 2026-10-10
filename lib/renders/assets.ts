/**
 * The one server-side image loader for renders and URL imports (API routes,
 * worker, MCP). `lib/render/node` re-exports it.
 *
 * - `{media}` sources are read from the private `media` bucket after an
 *   ownership check (the media row must belong to the workspace and be an
 *   image); the bytes are re-sniffed with `checkImageBytes`.
 * - `{url}` sources go through the SSRF guard (public http/https hosts only,
 *   no credentials, re-checked on every redirect), a total timeout and a
 *   streamed size cap, and the body must sniff as a supported image (the
 *   declared Content-Type is never trusted). Requests use `guardedFetch`,
 *   which pins each connection to the address the policy approved, so DNS
 *   rebinding cannot redirect the socket after the check.
 */
import dns from "node:dns"
import net from "node:net"

import type { Repositories, WorkspaceId } from "@/lib/data"
import { cachedAssetLoader, checkImageBytes } from "@/lib/render/assets"
import { AssetLoadError, type AssetLoader, type LoadedAsset } from "@/lib/render/engine"
import type { ResolvedImageSource } from "@/lib/render/spec"
import {
  assertPublicHttpUrl,
  BlockedUrlError,
  guardedFetch,
  isBlockedAddress,
  type LookupFn,
} from "@/lib/url-guard"

export const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const REMOTE_IMAGE_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 3
const USER_AGENT = "LumenClipRenderer/1.0"

export const SUPPORTED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const

export type RemoteFetchOptions = {
  /** Single-hop fetch (redirects returned, not followed). Default: the DNS-pinned `guardedFetch`. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
  maxBytes?: number
  /** Total budget across every redirect hop and the body read. */
  timeoutMs?: number
  maxRedirects?: number
  userAgent?: string
  /** Throws when the URL is not a public http(s) URL. Default: `lookup` + `isAllowedAddress`. */
  guard?: (url: string) => Promise<unknown>
  /** DNS resolution for the guard and the pinned fetch (tests inject fakes). */
  lookup?: LookupFn
  /** Address policy for the guard and the pinned fetch. Default: reject `isBlockedAddress`. */
  isAllowedAddress?: (ip: string) => boolean
}

export function isSupportedImageMime(mime: string): boolean {
  return (SUPPORTED_IMAGE_MIMES as readonly string[]).includes(mime)
}

/** Sniffs the image type from magic bytes; null when unknown. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp"
  if (b.length >= 6 && ascii(b, 0, 4) === "GIF8") return "image/gif"
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(b, 8, 12))) return "image/avif"
  return null
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}

/** Pixel size from PNG/JPEG/GIF/WebP headers; null when not parseable. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const mime = sniffImageMime(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    if (mime === "image/png" && bytes.length >= 24) {
      return { width: view.getUint32(16), height: view.getUint32(20) }
    }
    if (mime === "image/gif" && bytes.length >= 10) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
    }
    if (mime === "image/webp" && bytes.length >= 30) {
      const chunk = ascii(bytes, 12, 16)
      if (chunk === "VP8X") {
        return {
          width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
          height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
        }
      }
      if (chunk === "VP8 ") {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
      }
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true)
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
      }
    }
    if (mime === "image/jpeg") {
      let offset = 2
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null
        const marker = bytes[offset + 1]
        const length = view.getUint16(offset + 2)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
        }
        offset += 2 + length
      }
    }
  } catch {
    return null
  }
  return null
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AssetLoadError("asset.too_large", `Image is larger than ${maxBytes} bytes.`)
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>
    try {
      step = await reader.read()
    } catch (error) {
      throw new AssetLoadError(
        "asset.fetch_failed",
        `Reading the image failed: ${error instanceof Error ? error.message : "stream error"}`
      )
    }
    const { done, value } = step
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new AssetLoadError("asset.too_large", `Image is larger than ${maxBytes} bytes.`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

const defaultLookup: LookupFn = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true })

/**
 * Early URL check honouring injected `lookup`/`isAllowedAddress`: http(s), no
 * credentials, and every resolved address allowed. Without injections this is
 * `assertPublicHttpUrl`. `guardedFetch` re-checks at connect time either way.
 */
function defaultGuard(options: RemoteFetchOptions): (url: string) => Promise<unknown> {
  if (!options.lookup && !options.isAllowedAddress) return assertPublicHttpUrl
  const lookup = options.lookup ?? defaultLookup
  const isAllowed = options.isAllowedAddress ?? ((ip: string) => !isBlockedAddress(ip))
  return async (raw) => {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("URL must use http or https")
    if (url.username || url.password) throw new BlockedUrlError("URL may not contain credentials")
    const host = url.hostname.replace(/^\[|\]$/g, "")
    if (net.isIP(host)) {
      if (!isAllowed(host)) throw new BlockedUrlError("URL points to a private or reserved address")
      return
    }
    const addresses = await lookup(host)
    if (addresses.length === 0) throw new BlockedUrlError("URL hostname could not be resolved")
    if (addresses.some((a) => !isAllowed(a.address))) {
      throw new BlockedUrlError("URL hostname resolves to a private or reserved address")
    }
  }
}

/** Fetches a public image with the SSRF guard, redirect re-checks, a total timeout and a size cap. */
export async function fetchRemoteImage(url: string, options: RemoteFetchOptions = {}): Promise<LoadedAsset> {
  const doFetch =
    options.fetch ??
    ((input: string, init?: RequestInit) =>
      guardedFetch(input, { ...init, lookup: options.lookup, isAllowedAddress: options.isAllowedAddress }))
  const guard = options.guard ?? defaultGuard(options)
  const maxBytes = options.maxBytes ?? REMOTE_IMAGE_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const signal = AbortSignal.timeout(options.timeoutMs ?? REMOTE_IMAGE_TIMEOUT_MS)
  let current = url
  for (let hop = 0; hop <= maxRedirects; hop++) {
    try {
      await guard(current)
    } catch (error) {
      throw new AssetLoadError(
        "asset.fetch_failed",
        `Refusing to fetch ${current}: ${error instanceof Error ? error.message : "blocked URL"}`
      )
    }
    let response: Response
    try {
      response = await doFetch(current, {
        redirect: "manual",
        signal,
        headers: { accept: SUPPORTED_IMAGE_MIMES.join(","), "user-agent": options.userAgent ?? USER_AGENT },
      })
    } catch (error) {
      const reason = error instanceof BlockedUrlError
        ? "blocked address"
        : signal.aborted
          ? "timed out"
          : error instanceof Error
            ? error.message
            : "network error"
      throw new AssetLoadError("asset.fetch_failed", `Could not fetch ${current}: ${reason}`)
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      const location = response.headers.get("location")
      if (!location) throw new AssetLoadError("asset.fetch_failed", `Redirect without location from ${current}`)
      current = new URL(location, current).toString()
      continue
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new AssetLoadError("asset.fetch_failed", `Fetching ${current} returned HTTP ${response.status}.`)
    }
    const bytes = await readCapped(response, maxBytes)
    // Never trust Content-Type: the body itself must sniff as a supported image.
    const mime = sniffImageMime(bytes)
    if (!mime || !isSupportedImageMime(mime)) {
      const declared = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
      throw new AssetLoadError(
        "asset.unsupported_type",
        `Unsupported image at ${url} (content does not sniff as PNG, JPEG, WebP, GIF or AVIF${declared ? `; declared "${declared}"` : ""}).`
      )
    }
    return { bytes, mime }
  }
  throw new AssetLoadError("asset.fetch_failed", `Too many redirects fetching ${url}.`)
}

export type ServerAssetLoaderOptions = RemoteFetchOptions & {
  /** Override for `{url}` sources (tests). Default: `fetchRemoteImage` with these options. */
  fetchUrl?: (url: string) => Promise<LoadedAsset>
}

/**
 * AssetLoader for one workspace: ownership-checked image media + guarded URLs,
 * each distinct source loaded once per loader (one render).
 */
export function createServerAssetLoader(
  repos: Pick<Repositories, "media" | "blobs">,
  workspaceId: WorkspaceId,
  options: ServerAssetLoaderOptions = {}
): AssetLoader {
  const { fetchUrl = (url: string) => fetchRemoteImage(url, options) } = options
  return cachedAssetLoader({
    async load(source: ResolvedImageSource): Promise<LoadedAsset> {
      if ("url" in source) return fetchUrl(source.url)
      const media = await repos.media.get(workspaceId, source.media)
      if (!media || media.deletedAt) {
        throw new AssetLoadError("asset.fetch_failed", `Media ${source.media} was not found in this workspace.`)
      }
      if (media.kind !== "image") {
        throw new AssetLoadError("asset.unsupported_type", `Media ${source.media} is not an image.`)
      }
      const blob = await repos.blobs.get(workspaceId, media.bucketId, media.fileId)
      if (!blob) throw new AssetLoadError("asset.fetch_failed", `The file for media ${source.media} is missing.`)
      const mime = checkImageBytes(blob.bytes, `Media ${source.media}`)
      return { bytes: blob.bytes, mime }
    },
  })
}
