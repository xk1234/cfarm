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

import { ASSET_LIMITS, checkImageBytes } from "../assets"
import { AssetLoadError, type LoadedAsset } from "../engine"

export type LookupAddress = { address: string; family: number }
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>

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

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  const out = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return out.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? out : null
}

/** Parses an IPv6 address into 8 16-bit groups (accepts `::` and an embedded dotted IPv4 tail). */
export function parseIpv6(input: string): number[] | null {
  let ip = input.toLowerCase()
  const zone = ip.indexOf("%")
  if (zone >= 0) ip = ip.slice(0, zone)
  let tail: number[] = []
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":")
    const v4 = parseIpv4(ip.slice(lastColon + 1))
    if (!v4) return null
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
    ip = ip.slice(0, lastColon + 1)
    if (!ip.endsWith("::")) {
      if (!ip.endsWith(":")) return null
      ip = ip.slice(0, -1)
    }
  }
  const halves = ip.split("::")
  if (halves.length > 2) return null
  const parse = (s: string) => (s === "" ? [] : s.split(":"))
  const head = parse(halves[0])
  const rest = halves.length === 2 ? parse(halves[1]) : []
  const groups = [...head, ...rest]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  const total = groups.length + tail.length
  if (halves.length === 1 && total !== 8) return null
  if (halves.length === 2 && total > 7) return null
  const zeros = new Array(8 - total).fill(0)
  return [...head.map((g) => parseInt(g, 16)), ...(halves.length === 2 ? zeros : []), ...rest.map((g) => parseInt(g, 16)), ...tail]
}

function blockedIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT (incl. 100.100.100.200 metadata)
    a === 127 ||
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  )
}

/** True for any address a server-side fetch must never reach. Unparseable input is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const clean = ip.trim().replace(/^\[|\]$/g, "")
  const v4 = parseIpv4(clean)
  if (v4) return blockedIpv4(v4)
  const g = parseIpv6(clean)
  if (!g) return true
  const embedded = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]
  if (g.slice(0, 7).every((x) => x === 0)) return true // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedIpv4(embedded(g[6], g[7])) // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return blockedIpv4(embedded(g[6], g[7])) // ::a.b.c.d (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b) return blockedIpv4(embedded(g[6], g[7])) // NAT64
  if (g[0] === 0x2002) return blockedIpv4(embedded(g[1], g[2])) // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true // unique local (incl. fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return true // link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // site-local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true // discard
  if (g[0] === 0x2001 && g[1] === 0) return true // Teredo
  return false
}

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
