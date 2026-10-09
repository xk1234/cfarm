/**
 * SSRF-guarded image fetch for `{url}` image sources (doc 01 §9).
 *
 * - http(s) only, no credentials in the URL.
 * - Every hostname is resolved by our own `lookup` hook that rejects private,
 *   loopback, link-local (incl. cloud metadata 169.254.169.254 / fd00:ec2::254),
 *   CGNAT, multicast and reserved ranges, IPv4-mapped/NAT64/6to4 IPv6 forms,
 *   and the socket connects to exactly the address that was checked (no DNS
 *   rebinding window). IP-literal hosts are checked directly.
 * - Redirects are followed manually (max 3), each hop re-validated.
 * - Byte cap (default 25 MB, Content-Length and streamed) and a total timeout.
 * - The body must sniff as an image.
 */
import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import net from "node:net"

import { isBlockedAddress, parseIpv6 } from "@/lib/url-guard"

import { ASSET_LIMITS, checkImageBytes } from "../assets"
import { AssetLoadError, type LoadedAsset } from "../engine"

import type { LookupAddress, LookupFn } from "@/lib/url-guard"
export type { LookupAddress, LookupFn }

export type RemoteFetchOptions = {
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  /** DNS resolution (tests inject fakes). Default: `dns.promises.lookup(host, {all: true})`. */
  lookup?: LookupFn
  /** Address policy. Default: reject `isBlockedAddress`. Tests may allow loopback servers. */
  isAllowedAddress?: (ip: string) => boolean
  userAgent?: string
}

const DEFAULTS = {
  maxBytes: ASSET_LIMITS.maxBytes,
  timeoutMs: 15_000,
  maxRedirects: 3,
}

// ───────────────────────────── address policy ─────────────────────────────

// One policy for every server-side fetch: see lib/url-guard.ts.
export { isBlockedAddress, parseIpv6 }

// ───────────────────────────── fetch ─────────────────────────────

const defaultLookup: LookupFn = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true })

function fail(message: string): never {
  throw new AssetLoadError("asset.fetch_failed", message)
}

function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    fail("Image URL is not a valid absolute URL.")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail("Image URLs must use http or https.")
  if (url.username || url.password) fail("Image URLs may not contain credentials.")
  return url
}

type Policy = Required<Pick<RemoteFetchOptions, "isAllowedAddress">> & { lookup: LookupFn }

/** A `lookup` for http(s).request that only ever yields allowed addresses. */
function guardedLookup(policy: Policy) {
  return (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (err: Error | null, address: string | LookupAddress[], family?: number) => void
  ) => {
    policy
      .lookup(hostname)
      .then((addresses) => {
        if (addresses.length === 0) throw new AssetLoadError("asset.fetch_failed", `Host "${hostname}" did not resolve.`)
        const blocked = addresses.find((a) => !policy.isAllowedAddress(a.address))
        if (blocked) throw new AssetLoadError("asset.fetch_failed", `Host "${hostname}" resolves to a private or reserved address.`)
        if (typeof options === "object" && options?.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      })
      .catch((err: Error) => callback(err, ""))
  }
}

type Hop = { status: number; location?: string; body?: Buffer }

function requestOnce(url: URL, policy: Policy, maxBytes: number, signal: AbortSignal, userAgent: string): Promise<Hop> {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host) && !policy.isAllowedAddress(host)) {
    return Promise.reject(new AssetLoadError("asset.fetch_failed", "Image URL points to a private or reserved address."))
  }
  const transport = url.protocol === "https:" ? https : http
  return new Promise<Hop>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup(policy) as never,
        headers: { "user-agent": userAgent, accept: "image/*" },
        signal,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve({ status, location: res.headers.location })
          return
        }
        if (status < 200 || status >= 300) {
          res.resume()
          reject(new AssetLoadError("asset.fetch_failed", `Image URL returned HTTP ${status}.`))
          return
        }
        const declared = Number(res.headers["content-length"])
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy()
          reject(new AssetLoadError("asset.too_large", `Image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            res.destroy()
            reject(new AssetLoadError("asset.too_large", `Image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`))
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks) }))
        res.on("error", (err) => reject(err))
      }
    )
    req.on("error", (err) => reject(err))
    req.end()
  })
}

/** Fetches an image URL under the SSRF policy. Throws AssetLoadError. */
export async function fetchRemoteImage(rawUrl: string, options: RemoteFetchOptions = {}): Promise<LoadedAsset> {
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects
  const policy: Policy = {
    lookup: options.lookup ?? defaultLookup,
    isAllowedAddress: options.isAllowedAddress ?? ((ip) => !isBlockedAddress(ip)),
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULTS.timeoutMs)
  try {
    let url = checkUrl(rawUrl)
    for (let hop = 0; ; hop++) {
      let result: Hop
      try {
        result = await requestOnce(url, policy, maxBytes, controller.signal, options.userAgent ?? "LumenClipRenderer/1.0")
      } catch (err) {
        if (err instanceof AssetLoadError) throw err
        if (controller.signal.aborted) fail("Image URL timed out.")
        // Errors raised inside the lookup hook surface wrapped by the socket.
        const cause = (err as { cause?: unknown })?.cause
        if (cause instanceof AssetLoadError) throw cause
        fail(`Image URL could not be fetched: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (result.location !== undefined) {
        if (hop >= maxRedirects) fail("Image URL redirected too many times.")
        url = checkUrl(new URL(result.location, url).toString())
        continue
      }
      const bytes = new Uint8Array(result.body ?? Buffer.alloc(0))
      const mime = checkImageBytes(bytes, "Image URL")
      return { bytes, mime }
    }
  } finally {
    clearTimeout(timer)
  }
}
