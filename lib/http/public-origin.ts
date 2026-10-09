/**
 * Public origin for absolute URLs returned to clients. Behind Railway's proxy
 * `request.url` is the container address (http://localhost:3000), so prefer
 * BASE_URL, then the forwarded host, then the request URL.
 */
export function publicOrigin(
  requestUrl: string,
  headers: { get(name: string): string | null | undefined },
  env: Record<string, string | undefined> = process.env
): string {
  const configured = parseOrigin(env.BASE_URL)
  if (configured) return configured
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  if (host) {
    const proto =
      headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"
    return `${proto}://${host}`
  }
  return new URL(requestUrl).origin
}

function parseOrigin(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin
  } catch {
    return null
  }
}
