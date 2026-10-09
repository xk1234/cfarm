/**
 * The one SSRF policy for every server-side fetch of a user-supplied URL
 * (render `{url}` images, URL imports, collection imports, the image proxy).
 *
 * - `isBlockedAddress` is the address policy: private, loopback, link-local
 *   (incl. cloud metadata), CGNAT, multicast, reserved, documentation ranges,
 *   and the IPv6 forms that embed them (IPv4-mapped, `::a.b.c.d`, NAT64, 6to4,
 *   Teredo, site-local, unique-local).
 * - `guardedFetch` is the enforcement point. It is a single-hop `fetch`
 *   (redirects come back as 3xx for the caller to re-submit) whose socket
 *   lookup runs the policy and connects to exactly the address it checked, so
 *   there is no DNS-rebinding window between "check" and "connect".
 * - `assertPublicHttpUrl` is an early, friendlier pre-check only; it must
 *   never be the sole guard in front of a plain `fetch`.
 */
import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import { Readable } from "node:stream"

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BlockedUrlError"
  }
}

// ───────────────────────────── address policy ─────────────────────────────

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  const out = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return out.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? out
    : null
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
  return [
    ...head.map((g) => parseInt(g, 16)),
    ...(halves.length === 2 ? zeros : []),
    ...rest.map((g) => parseInt(g, 16)),
    ...tail,
  ]
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
  const embedded = (hi: number, lo: number) => [
    hi >> 8,
    hi & 0xff,
    lo >> 8,
    lo & 0xff,
  ]
  if (g.slice(0, 7).every((x) => x === 0)) return true // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff)
    return blockedIpv4(embedded(g[6], g[7])) // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0))
    return blockedIpv4(embedded(g[6], g[7])) // ::a.b.c.d (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b) return blockedIpv4(embedded(g[6], g[7])) // NAT64
  if (g[0] === 0x2002) return blockedIpv4(embedded(g[1], g[2])) // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true // unique local (incl. fd00:ec2::254, Railway fd..)
  if ((g[0] & 0xffc0) === 0xfe80) return true // link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // site-local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true // discard
  if (g[0] === 0x2001 && g[1] === 0) return true // Teredo
  return false
}

/** Alias of `isBlockedAddress` for IP strings (kept for existing callers). */
export function isPrivateAddress(ip: string): boolean {
  return isBlockedAddress(ip)
}

function cleanHostname(value: string) {
  return value
    .trim()
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase()
}

// ───────────────────────────── pre-check ─────────────────────────────

/**
 * Early validation: http(s), no credentials, and the host currently resolves
 * to public addresses. Not sufficient on its own (DNS can change between this
 * check and a later connect); `guardedFetch` re-checks at connect time.
 */
export async function assertPublicHttpUrl(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedUrlError("URL must use http or https")
  }
  if (parsed.username || parsed.password)
    throw new BlockedUrlError("URL may not contain credentials")

  const hostname = cleanHostname(parsed.hostname)
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname))
      throw new BlockedUrlError(
        "URL hostname resolves to a private or reserved address"
      )
    return parsed
  }

  const addresses = await dns.promises.lookup(hostname, { all: true })
  if (addresses.length === 0)
    throw new BlockedUrlError("URL hostname could not be resolved")
  for (const address of addresses) {
    if (isBlockedAddress(address.address)) {
      throw new BlockedUrlError(
        "URL hostname resolves to a private or reserved address"
      )
    }
  }
  return parsed
}

// ───────────────────────────── pinned fetch ─────────────────────────────

export type LookupAddress = { address: string; family: number }
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>

export type GuardedFetchInit = {
  /** GET (default) or HEAD; anything else is refused. */
  method?: string
  headers?: HeadersInit
  signal?: AbortSignal | null
  /** Ignored: redirects are always returned to the caller (manual), who must re-submit each hop. */
  redirect?: RequestRedirect
  /** DNS resolution (tests inject fakes). Default: `dns.promises.lookup(host, {all: true})`. */
  lookup?: LookupFn
  /** Address policy. Default: reject `isBlockedAddress`. */
  isAllowedAddress?: (ip: string) => boolean
}

const defaultLookup: LookupFn = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true })

/** A `lookup` for http(s).request that only ever yields allowed addresses. */
export function guardedLookup(
  lookup: LookupFn,
  isAllowed: (ip: string) => boolean
) {
  return (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (
      err: Error | null,
      address: string | LookupAddress[],
      family?: number
    ) => void
  ) => {
    lookup(hostname)
      .then((addresses) => {
        if (addresses.length === 0)
          throw new BlockedUrlError(`Host "${hostname}" did not resolve.`)
        if (addresses.some((a) => !isAllowed(a.address))) {
          throw new BlockedUrlError(
            `Host "${hostname}" resolves to a private or reserved address.`
          )
        }
        if (typeof options === "object" && options?.all)
          callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      })
      .catch((err: Error) => callback(err, ""))
  }
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || key === "set-cookie") continue
    headers.set(key, Array.isArray(value) ? value.join(", ") : value)
  }
  return headers
}

function unwrapBlocked(error: unknown): unknown {
  const cause = (error as { cause?: unknown })?.cause
  return cause instanceof BlockedUrlError ? cause : error
}

/**
 * One SSRF-safe HTTP request with a `fetch`-compatible shape. The connection is
 * pinned to the address the policy approved; redirects are not followed.
 * Throws `BlockedUrlError` for disallowed URLs/addresses.
 */
export async function guardedFetch(
  input: string | URL,
  init: GuardedFetchInit = {}
): Promise<Response> {
  let url: URL
  try {
    url = new URL(String(input))
  } catch {
    throw new BlockedUrlError("URL is not a valid absolute URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new BlockedUrlError("URL must use http or https")
  if (url.username || url.password)
    throw new BlockedUrlError("URL may not contain credentials")
  const isAllowed =
    init.isAllowedAddress ?? ((ip: string) => !isBlockedAddress(ip))
  const host = cleanHostname(url.hostname)
  if (net.isIP(host) && !isAllowed(host)) {
    throw new BlockedUrlError("URL points to a private or reserved address")
  }
  const method = (init.method ?? "GET").toUpperCase()
  if (method !== "GET" && method !== "HEAD") {
    throw new BlockedUrlError("Only GET and HEAD requests are allowed")
  }
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value
  })
  const transport = url.protocol === "https:" ? https : http
  const signal = init.signal ?? undefined
  return new Promise<Response>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        lookup: guardedLookup(init.lookup ?? defaultLookup, isAllowed) as never,
        headers,
        signal,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0
        const nullBody =
          NULL_BODY_STATUSES.has(status) || method === "HEAD"
        if (nullBody) res.resume()
        try {
          resolve(
            new Response(
              nullBody
                ? null
                : (Readable.toWeb(
                    res
                  ) as unknown as ReadableStream<Uint8Array>),
              {
                status,
                statusText: res.statusMessage,
                headers: toHeaders(res.headers),
              }
            )
          )
        } catch (error) {
          res.destroy()
          reject(error)
        }
      }
    )
    req.on("error", (error) => reject(unwrapBlocked(error)))
    req.end()
  })
}
