import "server-only"

export type WebsiteCopy = { headline: string; description: string }
export type WebsiteContent = Record<string, WebsiteCopy>

/** Optional public-site CMS only. Application records and authentication stay with the existing backend. */
export async function loadWebsiteContent(
  project: string,
  defaults: WebsiteContent
): Promise<WebsiteContent> {
  const endpoint = process.env.CRAFT_CONTENT_URL
  const token = process.env.CRAFT_CONTENT_TOKEN
  if (!endpoint && !token) return defaults
  if (!endpoint || !token)
    throw new Error("Craft content configuration is incomplete")
  const url = new URL(endpoint)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid Craft content endpoint")
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Production Craft content requires HTTPS")
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok)
    throw new Error(`Craft content unavailable (${response.status})`)
  const body = await response.text()
  if (body.length > 512_000)
    throw new Error("Craft content response exceeds limit")
  const payload: unknown = JSON.parse(body)
  if (!payload || typeof payload !== "object")
    throw new Error("Invalid Craft content")
  const data = payload as {
    version?: unknown
    project?: unknown
    entries?: unknown
  }
  if (
    data.version !== 1 ||
    data.project !== project ||
    !Array.isArray(data.entries)
  ) {
    throw new Error("Craft content contract mismatch")
  }
  const result: WebsiteContent = {}
  for (const raw of data.entries) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid Craft entry")
    const entry = raw as Record<string, unknown>
    if (
      typeof entry.key !== "string" ||
      !Object.hasOwn(defaults, entry.key) ||
      Object.hasOwn(result, entry.key)
    ) {
      throw new Error("Unexpected or duplicate Craft content key")
    }
    if (
      typeof entry.headline !== "string" ||
      !entry.headline.trim() ||
      entry.headline.length > 500 ||
      typeof entry.description !== "string" ||
      entry.description.length > 5000
    ) {
      throw new Error("Invalid Craft website copy")
    }
    result[entry.key] = {
      headline: entry.headline,
      description: entry.description,
    }
  }
  if (Object.keys(result).length !== Object.keys(defaults).length)
    throw new Error("Required published Craft entries are missing")
  return result
}
