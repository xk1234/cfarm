import crypto from "node:crypto"
import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clean } from "@/lib/guards"
import { PostIdentityConflictError } from "@/lib/post-repository-errors"
import {
  normalizeIdentityProvider,
  normalizePost,
  postIdentityClaimsForPost,
  type Post,
  type PostIdentityClaim,
  type PostIdentityKind,
} from "@/lib/posts"

export const POSTS_TABLE = "posts"
export const POST_IDENTITIES_TABLE = "post_identities"

const PAGE = 100

export type PostWriteState = "pending" | "reconciled" | "repair_required"

export type PostRepairEvent = {
  eventId: string
  operation: "dual_write"
  target: "canonical_posts" | "legacy_output_publications"
  retryable: true
  occurredAt: string
  message: string
}

export type PostIdentityRecord = {
  ownerId: string
  kind: PostIdentityKind
  identityHash: string
  postId: string
  createdAt: string
  claim: PostIdentityClaim
}

export type PostPatch = Partial<
  Omit<Post, "schemaVersion" | "id" | "ownerId" | "createdAt">
>

export type PostUpsertOptions = {
  writeState?: PostWriteState
  reconciledAt?: string | null
  repairEvent?: PostRepairEvent | null
}

type PostRow = Record<string, unknown> & {
  $id: string
  owner_id?: string
  rid?: string
  write_state?: string
  reconciled_at?: string
  repair_data?: string
  data?: string
}

type IdentityRow = Record<string, unknown> & {
  $id: string
  rid?: string
  owner_id?: string
  source_key?: string
  identity_kind?: string
  identity_hash?: string
  post_id?: string
  created_at?: string
  data?: string
}

export interface AppwritePostStore {
  listPosts(ownerId: string): Promise<Post[]>
  getPost(ownerId: string, id: string): Promise<Post | null>
  upsertPost(post: Post, options?: PostUpsertOptions): Promise<Post>
  claimPostIdentity(
    ownerId: string,
    postId: string,
    claim: PostIdentityClaim
  ): Promise<PostIdentityRecord>
  patchPost(ownerId: string, id: string, patch: PostPatch): Promise<Post | null>
  deletePost(ownerId: string, id: string): Promise<Post | null>
  setPostWriteState(
    ownerId: string,
    id: string,
    state: PostWriteState,
    options?: {
      reconciledAt?: string | null
      repairEvent?: PostRepairEvent | null
    }
  ): Promise<void>
}

export class AppwritePostRepository implements AppwritePostStore {
  async listPosts(ownerIdInput: string): Promise<Post[]> {
    const ownerId = required(ownerIdInput, "post owner")
    const rows: PostRow[] = []
    let cursor: string | null = null
    for (;;) {
      const queries = [
        Query.equal("owner_id", [ownerId]),
        Query.equal("write_state", ["reconciled"]),
        Query.limit(PAGE),
      ]
      if (cursor) queries.push(Query.cursorAfter(cursor))
      const response = await tables().listRows(
        APPWRITE_DATABASE_ID,
        POSTS_TABLE,
        queries
      )
      rows.push(...(response.rows as PostRow[]))
      if (response.rows.length < PAGE) break
      cursor = response.rows.at(-1)?.$id ?? null
    }
    return rows.flatMap((row) => {
      const post = postFromRow(row)
      return post && post.ownerId === ownerId ? [post] : []
    })
  }

  async getPost(ownerIdInput: string, idInput: string): Promise<Post | null> {
    const ownerId = required(ownerIdInput, "post owner")
    const id = clean(idInput)
    if (!id) return null

    const direct = await this.getStoredPost(ownerId, id)
    if (direct?.writeState === "reconciled") return direct.post

    const aliasClaim = postIdClaim(ownerId, id)
    const identity = await getIdentity(aliasClaim)
    if (!identity || identity.ownerId !== ownerId) return null
    const aliased = await this.getStoredPost(ownerId, identity.postId)
    return aliased?.writeState === "reconciled" ? aliased.post : null
  }

  async upsertPost(
    input: Post,
    options: PostUpsertOptions = {}
  ): Promise<Post> {
    const incoming = normalizePost(input)
    if (!incoming) throw new Error("A valid canonical post is required.")

    const claims = orderedClaims(postIdentityClaimsForPost(incoming))
    const existingClaims = (
      await Promise.all(claims.map((claim) => getIdentity(claim)))
    ).filter((record): record is PostIdentityRecord => Boolean(record))
    const resolvedPostIds = new Set(
      existingClaims.map((record) => record.postId)
    )
    if (resolvedPostIds.size > 1) {
      throw identityConflict(
        "The supplied identities resolve to different canonical posts."
      )
    }

    let targetId = [...resolvedPostIds][0] ?? incoming.id
    let reservedTarget = resolvedPostIds.size === 1
    for (const claim of claims) {
      const claimed = await reserveIdentity(incoming.ownerId, targetId, claim)
      if (claimed.postId === targetId) {
        reservedTarget = true
        continue
      }
      if (reservedTarget) {
        throw identityConflict(
          `The ${claim.kind} identity is already claimed by post "${claimed.postId}".`
        )
      }
      targetId = claimed.postId
      reservedTarget = true
    }

    const stored = await this.getStoredPost(incoming.ownerId, targetId)
    if (stored) assertCompatiblePostIdentity(stored.post, incoming)
    const post = mergePost(stored?.post ?? null, incoming, targetId)
    const writeState = options.writeState ?? stored?.writeState ?? "reconciled"
    await tables().upsertRow(
      APPWRITE_DATABASE_ID,
      POSTS_TABLE,
      postRowId(post.ownerId, post.id),
      postRowFields(post, {
        writeState,
        reconciledAt:
          options.reconciledAt === undefined
            ? writeState === "reconciled"
              ? new Date().toISOString()
              : stored?.reconciledAt
            : options.reconciledAt,
        repairEvent:
          options.repairEvent === undefined
            ? stored?.repairEvent
            : options.repairEvent,
      })
    )
    return post
  }

  async claimPostIdentity(
    ownerIdInput: string,
    postIdInput: string,
    claim: PostIdentityClaim
  ): Promise<PostIdentityRecord> {
    const ownerId = required(ownerIdInput, "post owner")
    const postId = required(postIdInput, "canonical post id")
    const record = await reserveIdentity(ownerId, postId, claim)
    if (record.postId !== postId) {
      throw identityConflict(
        `The ${claim.kind} identity is already claimed by post "${record.postId}".`
      )
    }
    return record
  }

  async patchPost(
    ownerIdInput: string,
    idInput: string,
    patch: PostPatch
  ): Promise<Post | null> {
    const ownerId = required(ownerIdInput, "post owner")
    const current = await this.getPost(ownerId, idInput)
    if (!current) return null
    return this.upsertPost({
      ...current,
      ...patch,
      schemaVersion: 1,
      id: current.id,
      ownerId: current.ownerId,
      createdAt: current.createdAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    })
  }

  async deletePost(
    ownerIdInput: string,
    idInput: string
  ): Promise<Post | null> {
    const ownerId = required(ownerIdInput, "post owner")
    const current = await this.getPost(ownerId, idInput)
    if (!current) return null

    const identities: IdentityRow[] = []
    let cursor: string | null = null
    for (;;) {
      const queries = [
        Query.equal("owner_id", [ownerId]),
        Query.equal("post_id", [current.id]),
        Query.limit(PAGE),
      ]
      if (cursor) queries.push(Query.cursorAfter(cursor))
      const response = await tables().listRows(
        APPWRITE_DATABASE_ID,
        POST_IDENTITIES_TABLE,
        queries
      )
      identities.push(...(response.rows as IdentityRow[]))
      if (response.rows.length < PAGE) break
      cursor = response.rows.at(-1)?.$id ?? null
    }
    for (const identity of identities) {
      await tables().deleteRow(
        APPWRITE_DATABASE_ID,
        POST_IDENTITIES_TABLE,
        identity.$id
      )
    }
    try {
      await tables().deleteRow(
        APPWRITE_DATABASE_ID,
        POSTS_TABLE,
        postRowId(ownerId, current.id)
      )
    } catch (error) {
      if (appwriteStatus(error) !== 404) throw error
    }
    return current
  }

  async setPostWriteState(
    ownerIdInput: string,
    idInput: string,
    state: PostWriteState,
    options: {
      reconciledAt?: string | null
      repairEvent?: PostRepairEvent | null
    } = {}
  ): Promise<void> {
    const ownerId = required(ownerIdInput, "post owner")
    const id = required(idInput, "canonical post id")
    await tables().updateRow(
      APPWRITE_DATABASE_ID,
      POSTS_TABLE,
      postRowId(ownerId, id),
      {
        write_state: state,
        reconciled_at:
          options.reconciledAt === undefined
            ? state === "reconciled"
              ? new Date().toISOString()
              : null
            : options.reconciledAt,
        repair_data: options.repairEvent
          ? JSON.stringify(options.repairEvent)
          : null,
      }
    )
  }

  private async getStoredPost(
    ownerId: string,
    id: string
  ): Promise<{
    post: Post
    writeState: PostWriteState
    reconciledAt: string | null
    repairEvent: PostRepairEvent | null
  } | null> {
    try {
      const row = (await tables().getRow(
        APPWRITE_DATABASE_ID,
        POSTS_TABLE,
        postRowId(ownerId, id)
      )) as PostRow
      const post = postFromRow(row)
      if (!post || post.ownerId !== ownerId || post.id !== id) return null
      return {
        post,
        writeState: normalizeWriteState(row.write_state),
        reconciledAt: clean(row.reconciled_at) || null,
        repairEvent: parseRepairEvent(row.repair_data),
      }
    } catch (error) {
      if (appwriteStatus(error) === 404) return null
      throw error
    }
  }
}

export const appwritePostRepository = new AppwritePostRepository()

export function postRowId(ownerId: string, postId: string): string {
  return deterministicRowId("p", ["posts", ownerId, postId])
}

export function postIdentityRowId(claim: PostIdentityClaim): string {
  return deterministicRowId("i", ["post_identity", claim.key])
}

export function postIdentityHash(claim: PostIdentityClaim): string {
  return crypto.createHash("sha256").update(claim.key).digest("hex")
}

export function postRepairEvent(input: {
  ownerId: string
  postId: string
  target: PostRepairEvent["target"]
  message: string
  occurredAt?: string
}): PostRepairEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  return {
    eventId: `repair-${crypto
      .createHash("sha256")
      .update(
        JSON.stringify([input.ownerId, input.postId, input.target, occurredAt])
      )
      .digest("hex")
      .slice(0, 24)}`,
    operation: "dual_write",
    target: input.target,
    retryable: true,
    occurredAt,
    message: clean(input.message) || "Post dual-write reconciliation failed.",
  }
}

async function reserveIdentity(
  ownerId: string,
  postId: string,
  claim: PostIdentityClaim
): Promise<PostIdentityRecord> {
  assertClaimOwner(ownerId, claim)
  const now = new Date().toISOString()
  const identityHash = postIdentityHash(claim)
  const rowId = postIdentityRowId(claim)
  try {
    const created = await tables().createRow(
      APPWRITE_DATABASE_ID,
      POST_IDENTITIES_TABLE,
      rowId,
      {
        rid: identityHash,
        owner_id: ownerId,
        source_key: "post_identity",
        identity_kind: claim.kind,
        identity_hash: identityHash,
        post_id: postId,
        created_at: now,
        data: JSON.stringify({ claim }),
      }
    )
    const row = created as unknown as IdentityRow
    return identityFromRow(row, claim)
  } catch (error) {
    if (appwriteStatus(error) !== 409) throw error
    const existing = await getIdentity(claim)
    if (!existing) {
      throw new Error(
        `Identity claim "${claim.kind}" conflicted but could not be read.`
      )
    }
    return existing
  }
}

async function getIdentity(
  claim: PostIdentityClaim
): Promise<PostIdentityRecord | null> {
  try {
    const row = (await tables().getRow(
      APPWRITE_DATABASE_ID,
      POST_IDENTITIES_TABLE,
      postIdentityRowId(claim)
    )) as IdentityRow
    return identityFromRow(row, claim)
  } catch (error) {
    if (appwriteStatus(error) === 404) return null
    throw error
  }
}

function identityFromRow(
  row: IdentityRow,
  expectedClaim: PostIdentityClaim
): PostIdentityRecord {
  const ownerId = clean(row.owner_id)
  const postId = clean(row.post_id)
  const kind = clean(row.identity_kind) as PostIdentityKind
  const identityHash = clean(row.identity_hash)
  if (
    ownerId !== claimOwner(expectedClaim) ||
    !postId ||
    kind !== expectedClaim.kind ||
    identityHash !== postIdentityHash(expectedClaim)
  ) {
    throw identityConflict("A stored post identity claim is malformed.")
  }
  return {
    ownerId,
    kind,
    identityHash,
    postId,
    createdAt: clean(row.created_at),
    claim: expectedClaim,
  }
}

export function postRowFields(
  post: Post,
  storage: {
    writeState: PostWriteState
    reconciledAt?: string | null
    repairEvent?: PostRepairEvent | null
  }
) {
  return {
    rid: post.id.slice(0, 1024),
    owner_id: post.ownerId,
    source_key: "canonical_post",
    schema_version: post.schemaVersion,
    intent_id: post.intentId.slice(0, 1024),
    origin: post.origin,
    source_type: post.sourceType ?? null,
    source_id: post.sourceId?.slice(0, 1024) ?? null,
    output_id: post.outputId?.slice(0, 255) ?? null,
    source_automation_id: post.automationId?.slice(0, 255) ?? null,
    source_run_id: post.runId?.slice(0, 255) ?? null,
    source_entity_id: post.sourceEntityId?.slice(0, 255) ?? null,
    integration_id: post.integrationId?.slice(0, 255) ?? null,
    provider: post.provider ?? null,
    lifecycle_status: post.lifecycleStatus,
    link_state: post.linkState,
    postfast_post_id: post.postfastPostId?.slice(0, 255) ?? null,
    external_post_id: post.externalPostId?.slice(0, 1024) ?? null,
    scheduled_at: post.scheduledAt ?? null,
    published_at: post.publishedAt ?? null,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    release_url: post.releaseUrl ?? null,
    write_state: storage.writeState,
    reconciled_at: storage.reconciledAt ?? null,
    repair_data: storage.repairEvent
      ? JSON.stringify(storage.repairEvent)
      : null,
    data: JSON.stringify(post),
  }
}

/** One canonical-post getRow request; unlike repository getPost, no alias read follows. */
export async function getCanonicalPostOnce(
  ownerIdInput: string,
  idInput: string
) {
  const ownerId = required(ownerIdInput, "post owner")
  const id = required(idInput, "canonical post id")
  try {
    const row = (await tables().getRow(
      APPWRITE_DATABASE_ID,
      POSTS_TABLE,
      postRowId(ownerId, id)
    )) as PostRow
    const post = postFromRow(row)
    return post?.ownerId === ownerId && post.id === id ? post : null
  } catch (error) {
    if (appwriteStatus(error) === 404) return null
    throw error
  }
}

/** Exactly one canonical-post createRow request. */
export async function createCanonicalPostOnce(postInput: Post) {
  const post = normalizePost(postInput)
  if (!post) throw new Error("A valid canonical post is required.")
  await tables().createRow(
    APPWRITE_DATABASE_ID,
    POSTS_TABLE,
    postRowId(post.ownerId, post.id),
    postRowFields(post, {
      writeState: "reconciled",
      reconciledAt: new Date().toISOString(),
    })
  )
  return post
}

/** Exactly one canonical-post updateRow request. */
export async function updateCanonicalPostOnce(postInput: Post) {
  const post = normalizePost(postInput)
  if (!post) throw new Error("A valid canonical post is required.")
  await tables().updateRow(
    APPWRITE_DATABASE_ID,
    POSTS_TABLE,
    postRowId(post.ownerId, post.id),
    postRowFields(post, {
      writeState: "reconciled",
      reconciledAt: new Date().toISOString(),
    })
  )
  return post
}

/** One identity getRow request with no conflict-resolution follow-up. */
export async function getPostIdentityOnce(claim: PostIdentityClaim) {
  return getIdentity(claim)
}

/** Exactly one identity createRow request; conflicts are surfaced to the composite. */
export async function createPostIdentityOnce(
  ownerIdInput: string,
  postIdInput: string,
  claim: PostIdentityClaim
) {
  const ownerId = required(ownerIdInput, "post owner")
  const postId = required(postIdInput, "canonical post id")
  assertClaimOwner(ownerId, claim)
  const now = new Date().toISOString()
  const identityHash = postIdentityHash(claim)
  const row = (await tables().createRow(
    APPWRITE_DATABASE_ID,
    POST_IDENTITIES_TABLE,
    postIdentityRowId(claim),
    {
      rid: identityHash,
      owner_id: ownerId,
      source_key: "post_identity",
      identity_kind: claim.kind,
      identity_hash: identityHash,
      post_id: postId,
      created_at: now,
      data: JSON.stringify({ claim }),
    }
  )) as unknown as IdentityRow
  return identityFromRow(row, claim)
}

function postFromRow(row: PostRow): Post | null {
  if (typeof row.data !== "string") return null
  try {
    return normalizePost(JSON.parse(row.data))
  } catch {
    return null
  }
}

function mergePost(current: Post | null, incoming: Post, id: string): Post {
  if (!current) {
    return normalizePost({ ...incoming, id }) ?? { ...incoming, id }
  }
  const merged = normalizePost({
    ...current,
    ...incoming,
    schemaVersion: 1,
    id,
    intentId: current.intentId,
    ownerId: current.ownerId,
    createdAt: current.createdAt,
  })
  if (!merged) throw new Error("The canonical post merge was invalid.")
  return merged
}

function assertCompatiblePostIdentity(current: Post, incoming: Post) {
  const samePostfastIdentity = Boolean(
    current.postfastPostId &&
    incoming.postfastPostId &&
    current.postfastPostId === incoming.postfastPostId
  )
  if (
    current.integrationId &&
    incoming.integrationId &&
    current.integrationId !== incoming.integrationId &&
    !samePostfastIdentity
  ) {
    throw identityConflict(
      `Post "${current.id}" belongs to a different integration.`
    )
  }
  if (
    current.provider &&
    incoming.provider &&
    normalizeIdentityProvider(current.provider) !==
      normalizeIdentityProvider(incoming.provider)
  ) {
    throw identityConflict(
      `Post "${current.id}" belongs to a different provider.`
    )
  }
  if (
    current.externalPostId &&
    incoming.externalPostId &&
    current.externalPostId !== incoming.externalPostId
  ) {
    throw identityConflict(
      `Post "${current.id}" already claims a different external post id.`
    )
  }
  if (
    current.postfastPostId &&
    incoming.postfastPostId &&
    current.postfastPostId !== incoming.postfastPostId &&
    !(
      current.id === incoming.id &&
      current.lifecycleStatus === "scheduled" &&
      incoming.lifecycleStatus === "scheduled" &&
      current.integrationId === incoming.integrationId &&
      normalizeIdentityProvider(current.provider) ===
        normalizeIdentityProvider(incoming.provider)
    )
  ) {
    throw identityConflict(
      `Post "${current.id}" already claims a different PostFast post id.`
    )
  }
}

function orderedClaims(claims: PostIdentityClaim[]) {
  const order: Record<PostIdentityKind, number> = {
    postfast: 0,
    provider_external: 1,
    intent: 2,
    legacy_source: 3,
    post_id: 4,
  }
  return [...claims].sort((left, right) => order[left.kind] - order[right.kind])
}

function postIdClaim(ownerId: string, id: string): PostIdentityClaim {
  return {
    kind: "post_id",
    key: JSON.stringify(["post_id", ownerId, id]),
  }
}

function assertClaimOwner(ownerId: string, claim: PostIdentityClaim) {
  if (claimOwner(claim) === ownerId) return
  throw identityConflict("The identity claim does not match the post owner.")
}

function claimOwner(claim: PostIdentityClaim) {
  try {
    const values = JSON.parse(claim.key)
    if (
      Array.isArray(values) &&
      values[0] === claim.kind &&
      typeof values[1] === "string"
    ) {
      return clean(values[1])
    }
  } catch {
    return ""
  }
  return ""
}

function normalizeWriteState(value: unknown): PostWriteState {
  return value === "reconciled" || value === "repair_required"
    ? value
    : "pending"
}

function parseRepairEvent(value: unknown): PostRepairEvent | null {
  if (typeof value !== "string" || !value) return null
  try {
    const event = JSON.parse(value) as Partial<PostRepairEvent>
    return event.eventId &&
      event.operation === "dual_write" &&
      event.retryable === true
      ? (event as PostRepairEvent)
      : null
  } catch {
    return null
  }
}

function deterministicRowId(prefix: string, values: string[]) {
  return `${prefix}${crypto
    .createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex")
    .slice(0, 35)}`
}

function tables() {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  return aw.tables
}

function appwriteStatus(error: unknown) {
  if (!error || typeof error !== "object") return null
  const value = (error as { code?: unknown }).code
  return typeof value === "number" ? value : Number(value) || null
}

function required(value: string, label: string) {
  const normalized = clean(value)
  if (!normalized) throw new Error(`A ${label} is required.`)
  return normalized
}

function identityConflict(message: string) {
  return new PostIdentityConflictError(message)
}
