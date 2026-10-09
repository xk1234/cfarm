import "server-only"

import crypto from "node:crypto"

import { clean } from "@/lib/guards"
import { PostIdentityConflictError } from "@/lib/post-repository-errors"
import {
  deleteDomainRecord,
  getDomainRecord,
  listDomainRecords,
  putDomainRecords,
} from "@/lib/railway/domain-record-store"
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

type StoredPost = {
  post: Post
  writeState: PostWriteState
  reconciledAt: string | null
  repairEvent: PostRepairEvent | null
  rowId: string
}

export interface PostStore {
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

export class RailwayPostRepository implements PostStore {
  async listPosts(ownerIdInput: string): Promise<Post[]> {
    const ownerId = required(ownerIdInput, "post owner")
    const rows = await listDomainRecords({
      table: POSTS_TABLE,
      ownerIds: [ownerId],
      limit: 1000,
    })
    return rows.flatMap((row) => {
      const stored = storedPost(row.rowId, row.payload, row.sourceRow)
      return stored && stored.post.ownerId === ownerId ? [stored.post] : []
    })
  }

  async getPost(ownerIdInput: string, idInput: string): Promise<Post | null> {
    const ownerId = required(ownerIdInput, "post owner")
    const id = clean(idInput)
    if (!id) return null
    const direct = await this.getStoredPost(ownerId, id)
    if (direct?.writeState === "reconciled") return direct.post
    const identity = await this.getIdentity(postIdClaim(ownerId, id))
    if (!identity || identity.ownerId !== ownerId) return null
    const aliased = await this.getStoredPost(ownerId, identity.postId)
    return aliased?.writeState === "reconciled" ? aliased.post : null
  }

  async upsertPost(input: Post, options: PostUpsertOptions = {}): Promise<Post> {
    const incoming = normalizePost(input)
    if (!incoming) throw new Error("A valid canonical post is required.")
    const claims = orderedClaims(postIdentityClaimsForPost(incoming))
    const identities = (
      await Promise.all(claims.map((claim) => this.getIdentity(claim)))
    ).filter((record): record is PostIdentityRecord => Boolean(record))
    const targetIds = [...new Set(identities.map((record) => record.postId))]
    if (targetIds.length > 1) throw identityConflict()
    let targetId = targetIds[0] ?? incoming.id
    for (const claim of claims) {
      const claimed = await this.claimPostIdentity(
        incoming.ownerId,
        targetId,
        claim
      )
      if (claimed.postId === targetId) continue
      if (targetIds.length) throw identityConflict()
      targetId = claimed.postId
    }
    const stored = await this.getStoredPost(incoming.ownerId, targetId)
    if (stored) assertCompatiblePostIdentity(stored.post, incoming)
    const post = mergePost(stored?.post ?? null, incoming, targetId)
    const writeState = options.writeState ?? stored?.writeState ?? "reconciled"
    const reconciledAt =
      options.reconciledAt === undefined
        ? writeState === "reconciled"
          ? new Date().toISOString()
          : stored?.reconciledAt ?? null
        : options.reconciledAt
    const repairEvent =
      options.repairEvent === undefined
        ? stored?.repairEvent ?? null
        : options.repairEvent
    await putDomainRecords([postRecord(post, writeState, reconciledAt, repairEvent)])
    return post
  }

  async claimPostIdentity(
    ownerIdInput: string,
    postIdInput: string,
    claimInput: PostIdentityClaim
  ): Promise<PostIdentityRecord> {
    const ownerId = required(ownerIdInput, "post owner")
    const postId = required(postIdInput, "canonical post id")
    assertClaimOwner(ownerId, claimInput)
    const existing = await this.getIdentity(claimInput)
    if (existing) return existing
    const now = new Date().toISOString()
    const record: PostIdentityRecord = {
      ownerId,
      kind: claimInput.kind,
      identityHash: postIdentityHash(claimInput),
      postId,
      createdAt: now,
      claim: claimInput,
    }
    await putDomainRecords([identityRecord(record)])
    return record
  }

  async patchPost(ownerId: string, id: string, patch: PostPatch) {
    const current = await this.getPost(ownerId, id)
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

  async deletePost(ownerIdInput: string, idInput: string): Promise<Post | null> {
    const ownerId = required(ownerIdInput, "post owner")
    const current = await this.getPost(ownerId, idInput)
    if (!current) return null
    const claims = postIdentityClaimsForPost(current)
    for (const claim of claims) {
      await deleteDomainRecord(POST_IDENTITIES_TABLE, postIdentityRowId(claim))
    }
    await deleteDomainRecord(POSTS_TABLE, postRowId(ownerId, current.id))
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
    const stored = await this.getStoredPost(ownerId, id)
    if (!stored) throw new Error(`Canonical post ${id} was not found`)
    const reconciledAt =
      options.reconciledAt === undefined
        ? state === "reconciled"
          ? new Date().toISOString()
          : null
        : options.reconciledAt
    const repairEvent =
      options.repairEvent === undefined ? null : options.repairEvent
    await putDomainRecords([
      postRecord(stored.post, state, reconciledAt, repairEvent),
    ])
  }

  private async getStoredPost(
    ownerId: string,
    id: string
  ): Promise<StoredPost | null> {
    const row = await getDomainRecord(POSTS_TABLE, postRowId(ownerId, id))
    if (!row) return null
    const stored = storedPost(row.rowId, row.payload, row.sourceRow)
    return stored?.post.ownerId === ownerId && stored.post.id === id
      ? stored
      : null
  }

  private async getIdentity(
    claim: PostIdentityClaim
  ): Promise<PostIdentityRecord | null> {
    const row = await getDomainRecord(
      POST_IDENTITIES_TABLE,
      postIdentityRowId(claim)
    )
    return row ? identityFromRecord(row.payload, row.sourceRow, claim) : null
  }
}

export const railwayPostRepository = new RailwayPostRepository()

export async function getCanonicalPostOnce(ownerId: string, id: string) {
  const row = await getDomainRecord(POSTS_TABLE, postRowId(ownerId, id))
  return row ? storedPost(row.rowId, row.payload, row.sourceRow)?.post ?? null : null
}

export async function createCanonicalPostOnce(postInput: Post) {
  const post = normalizePost(postInput)
  if (!post) throw new Error("A valid canonical post is required.")
  const rowId = postRowId(post.ownerId, post.id)
  if (await getDomainRecord(POSTS_TABLE, rowId)) {
    throw new Error(`Canonical post ${post.id} already exists.`)
  }
  await putDomainRecords([
    postRecord(post, "reconciled", new Date().toISOString(), null),
  ])
  return post
}

export async function updateCanonicalPostOnce(postInput: Post) {
  const post = normalizePost(postInput)
  if (!post) throw new Error("A valid canonical post is required.")
  await putDomainRecords([
    postRecord(post, "reconciled", new Date().toISOString(), null),
  ])
  return post
}

export async function getPostIdentityOnce(claim: PostIdentityClaim) {
  const row = await getDomainRecord(
    POST_IDENTITIES_TABLE,
    postIdentityRowId(claim)
  )
  return row
    ? identityFromRecord(row.payload, row.sourceRow, claim)
    : null
}

export async function createPostIdentityOnce(
  ownerIdInput: string,
  postIdInput: string,
  claim: PostIdentityClaim
) {
  const ownerId = required(ownerIdInput, "post owner")
  const postId = required(postIdInput, "canonical post id")
  assertClaimOwner(ownerId, claim)
  const existing = await getPostIdentityOnce(claim)
  if (existing) throw new Error("Post identity already exists")
  const record: PostIdentityRecord = {
    ownerId,
    kind: claim.kind,
    identityHash: postIdentityHash(claim),
    postId,
    createdAt: new Date().toISOString(),
    claim,
  }
  await putDomainRecords([identityRecord(record)])
  return record
}

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
    eventId: `repair-${crypto.createHash("sha256").update(JSON.stringify([input.ownerId, input.postId, input.target, occurredAt])).digest("hex").slice(0, 24)}`,
    operation: "dual_write",
    target: input.target,
    retryable: true,
    occurredAt,
    message: clean(input.message) || "Post dual-write reconciliation failed.",
  }
}

function postRecord(
  post: Post,
  writeState: PostWriteState,
  reconciledAt: string | null,
  repairEvent: PostRepairEvent | null
) {
  const sourceRow = {
    owner_id: post.ownerId,
    rid: post.id,
    source_key: "canonical_post",
    lifecycle_status: post.lifecycleStatus,
    provider: post.provider,
    integration_id: post.integrationId,
    source_type: post.sourceType,
    source_run_id: post.runId,
    source_entity_id: post.sourceEntityId,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    release_url: post.releaseUrl,
    write_state: writeState,
    reconciled_at: reconciledAt,
    repair_data: repairEvent ? JSON.stringify(repairEvent) : null,
  }
  return {
    table: POSTS_TABLE,
    rowId: postRowId(post.ownerId, post.id),
    ownerId: post.ownerId,
    sourceKey: "canonical_post",
    rid: post.id.slice(0, 1024),
    name: (post.title || post.content || "").slice(0, 2048),
    status: post.lifecycleStatus,
    ord: -Date.parse(post.createdAt),
    payload: post,
    sourceRow,
  }
}

function identityRecord(record: PostIdentityRecord) {
  const sourceRow = {
    owner_id: record.ownerId,
    identity_kind: record.kind,
    identity_hash: record.identityHash,
    post_id: record.postId,
    created_at: record.createdAt,
    data: JSON.stringify({ claim: record.claim }),
  }
  return {
    table: POST_IDENTITIES_TABLE,
    rowId: postIdentityRowId(record.claim),
    ownerId: record.ownerId,
    sourceKey: "post_identity",
    rid: record.identityHash,
    ord: -Date.parse(record.createdAt),
    payload: { claim: record.claim },
    sourceRow,
  }
}

function storedPost(
  rowId: string,
  payload: unknown,
  sourceRow: Record<string, unknown>
): StoredPost | null {
  const post = normalizePost(payload)
  if (!post) return null
  const repairEvent = parseRepairEvent(sourceRow.repair_data)
  return {
    rowId,
    post,
    writeState: normalizeWriteState(sourceRow.write_state),
    reconciledAt: clean(sourceRow.reconciled_at) || null,
    repairEvent,
  }
}

function identityFromRecord(
  payload: unknown,
  sourceRow: Record<string, unknown>,
  expectedClaim: PostIdentityClaim
): PostIdentityRecord | null {
  const claim = (payload as { claim?: PostIdentityClaim } | null)?.claim
  if (!claim || claim.key !== expectedClaim.key) return null
  const ownerId = clean(sourceRow.owner_id)
  const postId = clean(sourceRow.post_id)
  const kind = clean(sourceRow.identity_kind) as PostIdentityKind
  const identityHash = clean(sourceRow.identity_hash)
  if (
    ownerId !== claimOwner(expectedClaim) ||
    !postId ||
    kind !== expectedClaim.kind ||
    identityHash !== postIdentityHash(expectedClaim)
  ) {
    throw identityConflict()
  }
  return {
    ownerId,
    kind,
    identityHash,
    postId,
    createdAt: clean(sourceRow.created_at),
    claim: expectedClaim,
  }
}

function mergePost(current: Post | null, incoming: Post, id: string): Post {
  if (!current) return normalizePost({ ...incoming, id }) ?? { ...incoming, id }
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
    throw identityConflict()
  }
  if (
    current.provider &&
    incoming.provider &&
    normalizeIdentityProvider(current.provider) !==
      normalizeIdentityProvider(incoming.provider)
  ) {
    throw identityConflict()
  }
  if (
    current.externalPostId &&
    incoming.externalPostId &&
    current.externalPostId !== incoming.externalPostId
  ) {
    throw identityConflict()
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
    throw identityConflict()
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
  throw identityConflict()
}

function claimOwner(claim: PostIdentityClaim) {
  try {
    const values = JSON.parse(claim.key)
    if (Array.isArray(values) && typeof values[1] === "string") return values[1]
  } catch {}
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
  return `${prefix}${crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 35)}`
}

function required(value: string, label: string) {
  const normalized = clean(value)
  if (!normalized) throw new Error(`A ${label} is required.`)
  return normalized
}

function identityConflict() {
  return new PostIdentityConflictError("Canonical post identity conflict")
}
