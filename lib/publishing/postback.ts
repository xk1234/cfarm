/**
 * SocialBu `postback_url` support. SocialBu POSTs `{post_id, account_id,
 * status}` when a post is created/published/failed. The URL carries our own
 * workspace and post ids plus an HMAC so the route can trust which row to
 * refresh; the body itself is never trusted (we re-read the post from SocialBu).
 *
 * Enabled only when both `BASE_URL` (public origin) and
 * `SOCIALBU_POSTBACK_SECRET` are set.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

export const SOCIALBU_POSTBACK_SECRET_ENV = "SOCIALBU_POSTBACK_SECRET"
export const POSTBACK_PATH = "/api/publishing/postback"

type Env = Record<string, string | undefined>

function signature(secret: string, workspaceId: string, postId: string): string {
  return createHmac("sha256", secret).update(`${workspaceId}:${postId}`).digest("hex")
}

export function postbackUrl(workspaceId: string, postId: string, env: Env = process.env): string | undefined {
  const secret = env[SOCIALBU_POSTBACK_SECRET_ENV]?.trim()
  const base = env.BASE_URL?.trim().replace(/\/+$/, "")
  if (!secret || !base || !/^https:\/\//i.test(base)) return undefined
  const url = new URL(`${base}${POSTBACK_PATH}`)
  url.searchParams.set("w", workspaceId)
  url.searchParams.set("p", postId)
  url.searchParams.set("sig", signature(secret, workspaceId, postId))
  return url.toString()
}

export function verifyPostback(url: URL, env: Env = process.env): { workspaceId: string; postId: string } | null {
  const secret = env[SOCIALBU_POSTBACK_SECRET_ENV]?.trim()
  if (!secret) return null
  const workspaceId = url.searchParams.get("w") ?? ""
  const postId = url.searchParams.get("p") ?? ""
  const sig = url.searchParams.get("sig") ?? ""
  if (!workspaceId || !postId || !/^[0-9a-f]{64}$/.test(sig)) return null
  const expected = Buffer.from(signature(secret, workspaceId, postId), "hex")
  const given = Buffer.from(sig, "hex")
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return { workspaceId, postId }
}
