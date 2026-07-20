import { clean } from "@/lib/guards"

export class ManualPublicationUrlError extends Error {
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = "ManualPublicationUrlError"
  }
}

export function parseManualPublicationUrl(input: {
  url: string
  provider: string
}) {
  let url: URL
  try {
    url = new URL(clean(input.url))
  } catch {
    throw new ManualPublicationUrlError("Enter a valid published-post URL")
  }
  if (url.protocol !== "https:") {
    throw new ManualPublicationUrlError("Published-post URLs must use HTTPS")
  }
  if (isPrivateHost(url.hostname)) {
    throw new ManualPublicationUrlError("Enter a public published-post URL")
  }

  const provider = normalizeProvider(input.provider)
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const allowedHosts = providerHosts[provider]
  if (
    !allowedHosts?.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    )
  ) {
    throw new ManualPublicationUrlError(
      `That URL does not match the selected ${providerLabel(provider)} account`
    )
  }

  const externalPostId = extractPostId(provider, url)
  if (!externalPostId) {
    throw new ManualPublicationUrlError(
      "Use the direct URL for the individual published post"
    )
  }
  url.hash = ""
  if (provider === "youtube") {
    const videoId = url.searchParams.get("v")
    url.search = videoId ? `?v=${encodeURIComponent(videoId)}` : ""
  } else {
    url.search = ""
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/"

  return { releaseUrl: url.toString(), externalPostId, provider }
}

const providerHosts: Record<string, string[]> = {
  x: ["x.com", "twitter.com"],
  threads: ["threads.net", "threads.com"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  facebook: ["facebook.com", "fb.watch"],
  pinterest: ["pinterest.com", "pin.it"],
  bluesky: ["bsky.app"],
  telegram: ["t.me"],
}

function normalizeProvider(provider: string) {
  const value = clean(provider).toLowerCase()
  if (value === "twitter") return "x"
  if (value.startsWith("tiktok")) return "tiktok"
  return value
}

function providerLabel(provider: string) {
  return provider === "x" ? "X" : provider[0]?.toUpperCase() + provider.slice(1)
}

function extractPostId(provider: string, url: URL) {
  const path = decodeURIComponent(url.pathname)
  const patterns: Record<string, RegExp[]> = {
    x: [/\/status\/(\d+)/i],
    threads: [/\/post\/([\w-]+)/i],
    instagram: [/\/(?:p|reel|tv)\/([\w-]+)/i],
    tiktok: [/\/(?:video|photo)\/(\d+)/i],
    youtube: [/\/shorts\/([\w-]+)/i, /^\/([\w-]+)$/i],
    linkedin: [
      /(?:activity|ugcPost|share)[:-]?(\d{8,})/i,
      /\/posts\/([^/?#]+)/i,
    ],
    facebook: [/\/(?:posts|videos|reel)\/([\w.-]+)/i],
    pinterest: [/\/pin\/(\d+)/i, /^\/([\w-]+)$/i],
    bluesky: [/\/profile\/[^/]+\/post\/([\w-]+)/i],
    telegram: [/\/[^/]+\/(\d+)/i],
  }
  if (provider === "youtube" && url.searchParams.get("v")) {
    return url.searchParams.get("v")!
  }
  for (const pattern of patterns[provider] ?? []) {
    const match = path.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ""
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}
