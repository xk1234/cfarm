/**
 * Workspace API keys for `/api/v1` and MCP (doc 03 §3.8).
 *
 * Keys look like `lc_<6 hex>_<32 base62>`; only sha256(plaintext) is stored and
 * the plaintext is returned exactly once at creation. A request authenticates
 * with `Authorization: Bearer <key>` or, in the app, with the Clerk session.
 */
import {
  API_KEY_SCOPES,
  looksLikeApiKey,
  type ApiKey,
  type ApiKeyScope,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"

export { API_KEY_SCOPES }

/** `last_used_at` is written at most this often per key. */
export const API_KEY_TOUCH_INTERVAL_MS = 60_000

export type ApiPrincipal = {
  workspaceId: WorkspaceId
  kind: "api_key" | "session"
  apiKeyId: string | null
  /** Scopes granted; a Clerk session holds every scope. */
  scopes: readonly ApiKeyScope[]
  /** Who created rows on behalf of this principal. */
  actor: string
}

export type ApiKeyView = Omit<ApiKey, "keyHash" | "workspaceId">

export function apiKeyView(key: ApiKey): ApiKeyView {
  const { keyHash: _hash, workspaceId: _ws, ...view } = key
  return view
}

export function hasScope(principal: Pick<ApiPrincipal, "scopes">, scope: ApiKeyScope): boolean {
  return principal.scopes.includes(scope)
}

export function parseScopes(input: unknown): ApiKeyScope[] | null {
  if (input === undefined || input === null) return [...API_KEY_SCOPES]
  if (!Array.isArray(input)) return null
  const out = new Set<ApiKeyScope>()
  for (const value of input) {
    if (typeof value !== "string" || !(API_KEY_SCOPES as readonly string[]).includes(value)) return null
    out.add(value as ApiKeyScope)
  }
  return out.size ? [...out] : null
}

export class ApiKeyInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApiKeyInputError"
  }
}

export async function createWorkspaceApiKey(
  repos: Repositories,
  workspaceId: WorkspaceId,
  input: { name?: unknown; scopes?: unknown; expiresAt?: unknown },
  createdBy: string
): Promise<{ apiKey: ApiKeyView; secret: string }> {
  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!name || name.length > 128) throw new ApiKeyInputError("Give the key a name (1–128 characters).")
  const scopes = parseScopes(input.scopes)
  if (!scopes) throw new ApiKeyInputError(`Scopes must be a non-empty list of: ${API_KEY_SCOPES.join(", ")}.`)
  let expiresAt: string | null = null
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const date = typeof input.expiresAt === "string" ? new Date(input.expiresAt) : null
    if (!date || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new ApiKeyInputError("expiresAt must be a future ISO date.")
    }
    expiresAt = date.toISOString()
  }
  const { apiKey, plaintext } = await repos.apiKeys.create(workspaceId, { name, scopes, createdBy, expiresAt })
  return { apiKey: apiKeyView(apiKey), secret: plaintext }
}

export async function listWorkspaceApiKeys(repos: Repositories, workspaceId: WorkspaceId): Promise<ApiKeyView[]> {
  return (await repos.apiKeys.list(workspaceId)).map(apiKeyView)
}

export async function revokeWorkspaceApiKey(repos: Repositories, workspaceId: WorkspaceId, id: string) {
  await repos.apiKeys.revoke(workspaceId, id)
}

/** The bearer token of an `Authorization` header, or null. */
export function parseBearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")
  return match ? match[1] : null
}

/** Resolves a presented API key to its principal; null when unknown, revoked or expired. */
export async function authenticateApiKey(
  repos: Repositories,
  token: string,
  now: Date = new Date()
): Promise<ApiPrincipal | null> {
  if (!looksLikeApiKey(token)) return null
  const key = await repos.apiKeys.resolve(token, now.toISOString())
  if (!key) return null
  const last = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0
  if (now.getTime() - last >= API_KEY_TOUCH_INTERVAL_MS) {
    await repos.apiKeys.touch(key.workspaceId, key.id, now.toISOString()).catch(() => undefined)
  }
  return {
    workspaceId: key.workspaceId,
    kind: "api_key",
    apiKeyId: key.id,
    scopes: key.scopes,
    actor: `api-key:${key.id}`,
  }
}

export function sessionPrincipal(workspaceId: WorkspaceId): ApiPrincipal {
  return { workspaceId, kind: "session", apiKeyId: null, scopes: [...API_KEY_SCOPES], actor: workspaceId }
}

export type AuthenticateOptions = {
  repos: Repositories
  /** The Clerk session's workspace id (Clerk user id), or null. */
  sessionWorkspaceId: () => Promise<WorkspaceId | null>
  now?: Date
}

/**
 * A request's principal. A presented bearer token must be a valid API key
 * (no fallback to the session); without one, the Clerk session is used.
 */
export async function authenticateRequest(
  headers: Headers,
  options: AuthenticateOptions
): Promise<ApiPrincipal | null> {
  const authorization = headers.get("authorization")
  if (authorization) {
    const token = parseBearerToken(authorization)
    return token ? authenticateApiKey(options.repos, token, options.now) : null
  }
  const workspaceId = await options.sessionWorkspaceId().catch(() => null)
  return workspaceId ? sessionPrincipal(workspaceId) : null
}

// ─────────────────────────────── rate limiting ───────────────────────────────

export type RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number }

/**
 * In-memory token bucket per key (per process). Good enough for one web
 * service; replicas each enforce their own budget.
 */
export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>()
  constructor(
    readonly capacity: number,
    readonly refillPerSecond: number,
    private readonly clock: () => number = Date.now
  ) {}

  take(key: string, cost = 1): RateLimitDecision {
    const now = this.clock()
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now }
    const elapsed = Math.max(0, now - bucket.updatedAt) / 1000
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond)
    bucket.updatedAt = now
    if (this.buckets.size > 10_000) this.buckets.clear()
    this.buckets.set(key, bucket)
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 }
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((cost - bucket.tokens) / this.refillPerSecond)),
    }
  }
}

/** Default budget: bursts of 60 requests, refilling at 1 request/second. */
export function createDefaultRateLimiter(): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(60, 1)
}

export function rateLimitKey(principal: ApiPrincipal): string {
  return principal.apiKeyId ? `key:${principal.apiKeyId}` : `session:${principal.workspaceId}`
}
