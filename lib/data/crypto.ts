/**
 * Id and secret helpers shared by every repository backend (server-only:
 * uses node:crypto). Ids follow Appwrite rules: ≤ 36 chars of
 * `[a-zA-Z0-9._-]`, not starting with a special character.
 */
import { createHash, randomBytes } from "node:crypto"

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex")
}

/** 20-char hex id, like Appwrite `ID.unique()`. */
export function newId(): string {
  return randomBytes(10).toString("hex")
}

/** Deterministic job id for dedupe: `j` + sha256(workspace:dedupeKey)[:35]. */
export function deterministicJobId(workspaceId: string | null, dedupeKey: string): string {
  return "j" + sha256Hex(`${workspaceId ?? "system"}:${dedupeKey}`).slice(0, 35)
}

/** Lease row id: `<jobId>.<attempt>`. */
export function leaseId(jobId: string, attempt: number): string {
  return `${jobId}.${attempt}`
}

function base62(bytes: Uint8Array): string {
  let out = ""
  for (const b of bytes) out += BASE62[b % 62]
  return out
}

export const API_KEY_PREFIX = "lc_"

/** `lc_<6 hex>_<32 base62>`; only `hashApiKey(plaintext)` is stored. */
export function generateApiKey(): { plaintext: string; prefix: string; keyHash: string } {
  const prefix = `${API_KEY_PREFIX}${randomBytes(3).toString("hex")}`
  const plaintext = `${prefix}_${base62(randomBytes(32))}`
  return { plaintext, prefix, keyHash: hashApiKey(plaintext) }
}

export function hashApiKey(plaintext: string): string {
  return sha256Hex(plaintext)
}

export function looksLikeApiKey(value: string): boolean {
  return /^lc_[0-9a-f]{6}_[0-9A-Za-z]{32}$/.test(value)
}
