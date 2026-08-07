import crypto, { randomUUID } from "node:crypto"
import path from "node:path"

import { clean } from "@/lib/guards"
import {
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
} from "@/lib/json-store"
import { listPublicationRecordsForRead } from "@/lib/post-repository"
import { parseManualPublicationUrl } from "@/lib/manual-publication"
import { TIKTOK_PLATFORM_POST_ID_REQUIRED } from "@/lib/tiktok-comment-errors"

const rootDir = path.join(process.cwd(), "data")
const stores = {
  collections: ["tiktok-comments/collections.json", "collections"],
  comments: ["tiktok-comments/comments.json", "comments"],
  drafts: ["tiktok-comments/drafts.json", "drafts"],
  approvals: ["tiktok-comments/approvals.json", "approvals"],
  sends: ["tiktok-comments/send-results.json", "sendResults"],
} as const
const TOKEN_TTL_MS = 60 * 60 * 1000

export type TikTokReplyStyle = "substantive" | "affirming" | "emoji" | "careful"

export type TikTokCommentCollection = {
  id: string
  status: "pending" | "capturing" | "ready" | "sending" | "complete" | "failed"
  postIds: string[]
  posts: Array<{
    postId: string
    platformPostId: string
    url: string
    status: "pending" | "capturing" | "ready" | "failed"
    topLevelCaptured?: number
    nestedReplyCount?: number
    headerCount?: number
    error?: string
  }>
  scope: "topLevel"
  maxComments: number
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export type CapturedTikTokComment = {
  id: string
  collectionId: string
  postId: string
  platformPostId: string
  tiktokCommentId: string
  displayName: string
  handle: string
  text: string
  likeCount: number
  replyCount: number
  dateText?: string
  capturedAt: string
  updatedAt: string
}

export type TikTokCommentReplyDraft = {
  id: string
  collectionId: string
  commentId: string
  postId: string
  style: TikTokReplyStyle
  text: string
  careful: boolean
  createdAt: string
  updatedAt: string
}

export type TikTokCommentReplyApproval = {
  id: string
  collectionId: string
  draftId: string
  commentId: string
  approvedText: string
  heart: boolean
  approvedAt: string
}

export type TikTokCommentReplySendResult = {
  id: string
  collectionId: string
  approvalId: string
  draftId: string
  commentId: string
  status: "pending" | "sent" | "failed"
  text: string
  heart: boolean
  createdAt: string
  updatedAt: string
  error?: string
}

type CaptureToken = {
  version: 1
  ownerId: string
  collectionId: string
  expiresAt: string
}

export async function createTikTokCommentCollection(input: {
  ownerId: string
  postIds: string[]
  scope?: "topLevel"
  maxComments?: number
  now?: Date
}) {
  const postIds = [...new Set(input.postIds.map(clean).filter(Boolean))]
  if (!postIds.length) throw new Error("Select at least one TikTok publication")
  const publications = await listPublicationRecordsForRead({
    surface: "tiktok_comments",
  })
  const posts = postIds.map((postId) => {
    const publication = publications.find((item) => item.id === postId)
    if (!publication) throw new Error(`TikTok publication not found: ${postId}`)
    if (!publication.provider?.toLowerCase().startsWith("tiktok")) {
      throw new Error(`Publication is not a TikTok post: ${postId}`)
    }
    const platformPostId =
      clean(publication.externalPostId) ||
      platformIdFromReleaseUrl(publication.releaseUrl)
    if (!platformPostId) {
      throw new Error(TIKTOK_PLATFORM_POST_ID_REQUIRED)
    }
    const releaseUrl = clean(publication.releaseUrl)
    return {
      postId: publication.id,
      platformPostId,
      url:
        releaseUrl ||
        `https://www.tiktok.com/@_/video/${encodeURIComponent(platformPostId)}`,
      status: "pending" as const,
    }
  })
  const now = input.now ?? new Date()
  const record: TikTokCommentCollection = {
    id: randomUUID(),
    status: "pending",
    postIds,
    posts,
    scope: "topLevel",
    maxComments: Math.min(500, Math.max(1, input.maxComments ?? 100)),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  }
  await save("collections", record)
  return {
    collection: record,
    token: signToken({
      version: 1,
      ownerId: clean(input.ownerId),
      collectionId: record.id,
      expiresAt: record.expiresAt,
    }),
  }
}

function platformIdFromReleaseUrl(value?: string) {
  if (!value) return ""
  try {
    return parseManualPublicationUrl({
      url: value,
      provider: "tiktok",
    }).externalPostId
  } catch {
    return ""
  }
}

export async function listTikTokCommentCollections(limit = 10) {
  const collections = await list<TikTokCommentCollection>("collections")
  return collections
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    )
    .slice(0, Math.max(1, limit))
}

export async function listTikTokComments(input: {
  collectionId?: string
  postId?: string
}) {
  const comments = await list<CapturedTikTokComment>("comments")
  return comments.filter(
    (item) =>
      (!input.collectionId || item.collectionId === input.collectionId) &&
      (!input.postId || item.postId === input.postId)
  )
}

export async function ingestTikTokComments(input: {
  token: string
  collectionId: string
  postId: string
  comments: Array<
    Omit<
      CapturedTikTokComment,
      "id" | "collectionId" | "postId" | "capturedAt" | "updatedAt"
    >
  >
  complete?: {
    topLevelCaptured: number
    nestedReplyCount: number
    headerCount?: number
  }
  error?: string
}) {
  const token = verifyToken(input.token)
  if (token.collectionId !== input.collectionId)
    throw new Error("Capture token does not match collection")
  const collection = await get<TikTokCommentCollection>(
    "collections",
    input.collectionId
  )
  if (!collection) throw new Error("Comment collection not found")
  const post = collection.posts.find((item) => item.postId === input.postId)
  if (!post) throw new Error("Publication is outside this collection")
  const now = new Date().toISOString()
  for (const raw of input.comments.slice(0, collection.maxComments)) {
    const tiktokCommentId = clean(raw.tiktokCommentId)
    if (!tiktokCommentId) throw new Error("tiktokCommentId is required")
    const id = `c${crypto.createHash("sha256").update(`${input.postId}:${tiktokCommentId}`).digest("hex").slice(0, 35)}`
    const existing = await get<CapturedTikTokComment>("comments", id)
    await save("comments", {
      ...raw,
      id,
      collectionId: collection.id,
      postId: post.postId,
      platformPostId: post.platformPostId,
      tiktokCommentId,
      capturedAt: existing?.capturedAt ?? now,
      updatedAt: now,
    } satisfies CapturedTikTokComment)
  }
  const updatedPost = {
    ...post,
    status: input.error
      ? ("failed" as const)
      : input.complete
        ? ("ready" as const)
        : ("capturing" as const),
    ...(input.complete ?? {}),
    ...(input.error ? { error: clean(input.error) } : {}),
  }
  const posts = collection.posts.map((item) =>
    item.postId === post.postId ? updatedPost : item
  )
  const ready = posts.every((item) => item.status === "ready")
  const failed = posts.some((item) => item.status === "failed")
  const updated = {
    ...collection,
    posts,
    status: failed
      ? ("failed" as const)
      : ready
        ? ("ready" as const)
        : ("capturing" as const),
    updatedAt: now,
  }
  await save("collections", updated)
  return { collection: updated, accepted: input.comments.length }
}

export async function saveTikTokReplyDrafts(drafts: TikTokCommentReplyDraft[]) {
  await Promise.all(drafts.map((draft) => save("drafts", draft)))
  return drafts
}
export const listTikTokReplyDrafts = (collectionId: string) =>
  list<TikTokCommentReplyDraft>("drafts").then((items) =>
    items.filter((item) => item.collectionId === collectionId)
  )
export const listTikTokReplyApprovals = (collectionId: string) =>
  list<TikTokCommentReplyApproval>("approvals").then((items) =>
    items.filter((item) => item.collectionId === collectionId)
  )

export async function approveTikTokReplyDrafts(input: {
  collectionId: string
  approvals: Array<{ draftId: string; text?: string; heart?: boolean }>
}) {
  const drafts = await listTikTokReplyDrafts(input.collectionId)
  const now = new Date().toISOString()
  const records = input.approvals.map((choice) => {
    const draft = drafts.find((item) => item.id === choice.draftId)
    if (!draft)
      throw new Error(`Draft is outside this collection: ${choice.draftId}`)
    const approvedText = clean(choice.text) || draft.text
    if (!approvedText) throw new Error("Approved reply text cannot be empty")
    return {
      id: `a${crypto.createHash("sha256").update(`${input.collectionId}:${draft.id}`).digest("hex").slice(0, 35)}`,
      collectionId: input.collectionId,
      draftId: draft.id,
      commentId: draft.commentId,
      approvedText,
      heart: choice.heart === true,
      approvedAt: now,
    } satisfies TikTokCommentReplyApproval
  })
  await Promise.all(records.map((record) => save("approvals", record)))
  return records
}

export async function queueApprovedTikTokReplies(input: {
  collectionId: string
  draftIds: string[]
  confirmSend: true
}) {
  if (input.confirmSend !== true) throw new Error("confirmSend must be true")
  const approvals = (
    await list<TikTokCommentReplyApproval>("approvals")
  ).filter(
    (item) =>
      item.collectionId === input.collectionId &&
      input.draftIds.includes(item.draftId)
  )
  const missing = input.draftIds.filter(
    (id) => !approvals.some((item) => item.draftId === id)
  )
  if (missing.length)
    throw new Error(
      `Explicit approval record required for draft ids: ${missing.join(", ")}`
    )
  const now = new Date().toISOString()
  const results = approvals.map((approval) => ({
    id: `s${crypto.createHash("sha256").update(approval.id).digest("hex").slice(0, 35)}`,
    collectionId: approval.collectionId,
    approvalId: approval.id,
    draftId: approval.draftId,
    commentId: approval.commentId,
    status: "pending" as const,
    text: approval.approvedText,
    heart: approval.heart,
    createdAt: now,
    updatedAt: now,
  }))
  await Promise.all(results.map((record) => save("sends", record)))
  return results
}

export async function getTikTokCommentCompanionManifest(tokenValue: string) {
  const token = verifyToken(tokenValue)
  const collection = await get<TikTokCommentCollection>(
    "collections",
    token.collectionId
  )
  if (!collection) throw new Error("Comment collection not found")
  const [allSends, comments, drafts, approvals] = await Promise.all([
    list<TikTokCommentReplySendResult>("sends").then((items) =>
      items.filter((item) => item.collectionId === collection.id)
    ),
    listTikTokComments({ collectionId: collection.id }),
    listTikTokReplyDrafts(collection.id),
    listTikTokReplyApprovals(collection.id),
  ])
  const sends = allSends.filter((item) => item.status === "pending")
  return {
    collection,
    comments,
    drafts,
    approvals,
    sendResults: allSends,
    sends: sends.map((send) => ({
      ...send,
      comment: comments.find((item) => item.id === send.commentId),
    })),
  }
}

export async function recordTikTokCommentSendResults(input: {
  collectionId: string
  results: Array<{
    sendId: string
    status: "sent" | "failed"
    error?: string
  }>
}) {
  const now = new Date().toISOString()
  const updated: TikTokCommentReplySendResult[] = []
  for (const result of input.results) {
    const existing = await get<TikTokCommentReplySendResult>(
      "sends",
      result.sendId
    )
    if (!existing || existing.collectionId !== input.collectionId) {
      throw new Error(
        `Send result is outside this collection: ${result.sendId}`
      )
    }
    const record = {
      ...existing,
      status: result.status,
      updatedAt: now,
      ...(result.error ? { error: clean(result.error) } : {}),
    }
    await save("sends", record)
    updated.push(record)
  }
  return updated
}

export function tiktokCommentCaptureContext(token: string) {
  const claims = verifyToken(token)
  return {
    ownerId: claims.ownerId,
    collectionId: claims.collectionId,
  }
}

function signToken(payload: CaptureToken) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = crypto
    .createHmac("sha256", tokenSecret())
    .update(body)
    .digest("base64url")
  return `${body}.${signature}`
}
function verifyToken(value: string): CaptureToken {
  const [body, signature, extra] = clean(value).split(".")
  if (!body || !signature || extra) throw new Error("Invalid capture token")
  const supplied = Buffer.from(signature, "base64url")
  const valid = tokenSecrets().some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(body).digest()
    return (
      expected.length === supplied.length &&
      crypto.timingSafeEqual(expected, supplied)
    )
  })
  if (!valid) throw new Error("Invalid capture token")
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as CaptureToken
  if (
    payload.version !== 1 ||
    !clean(payload.ownerId) ||
    !clean(payload.collectionId) ||
    Date.parse(payload.expiresAt) <= Date.now()
  ) {
    throw new Error("Capture token is invalid or expired")
  }
  return payload
}
function tokenSecret() {
  const secret = tokenSecrets()[0]
  if (!secret)
    throw new Error("TikTok comment capture signing is not configured")
  return secret
}
function tokenSecrets() {
  return [
    clean(process.env.TIKTOK_COMMENTS_CAPTURE_SECRET),
    clean(process.env.TIKTOK_STUDIO_CAPTURE_SECRET),
  ].filter((value, index, values) => value && values.indexOf(value) === index)
}
async function list<T>(key: keyof typeof stores): Promise<T[]> {
  const [fileName, storeKey] = stores[key]
  return readJsonArrayStore<T>({ rootDir, fileName, key: storeKey })
}
async function get<T>(key: keyof typeof stores, id: string): Promise<T | null> {
  const [fileName, storeKey] = stores[key]
  return readJsonArrayRecord<T>({
    rootDir,
    fileName,
    key: storeKey,
    id: clean(id),
  })
}
async function save<T extends { id: string }>(
  key: keyof typeof stores,
  record: T
) {
  const [fileName, storeKey] = stores[key]
  await upsertJsonArrayRecord({
    rootDir,
    fileName,
    key: storeKey,
    record,
    position: "first",
  })
  return record
}
