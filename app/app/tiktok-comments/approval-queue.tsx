"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  IconAlertTriangle,
  IconBrandTiktok,
  IconHeart,
  IconMessageCircle,
  IconSend,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type {
  CapturedTikTokComment,
  TikTokCommentCollection,
  TikTokCommentReplyApproval,
  TikTokCommentReplyDraft,
} from "@/lib/tiktok-comments"

type Queue = {
  comments: CapturedTikTokComment[]
  drafts: TikTokCommentReplyDraft[]
  approvals: TikTokCommentReplyApproval[]
}

const emptyQueue: Queue = {
  comments: [],
  drafts: [],
  approvals: [],
}

export function TikTokCommentApprovalQueue({
  initialCollectionId = "",
}: {
  initialCollectionId?: string
}) {
  const collectionId = initialCollectionId.trim()
  const [queue, setQueue] = useState<Queue>(emptyQueue)
  const [recentCollections, setRecentCollections] = useState<
    TikTokCommentCollection[]
  >([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [hearts, setHearts] = useState<Record<string, boolean>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [confirmingApproveAll, setConfirmingApproveAll] = useState(false)

  useEffect(() => {
    let active = true

    void Promise.resolve()
      .then(() => {
        if (active) {
          setLoading(true)
          setLoadError("")
        }
        return fetchApprovalPage(collectionId)
      })
      .then((body) => {
        if (!active) return
        if ("collections" in body) {
          setRecentCollections(body.collections)
          return
        }
        setQueue(body)
        setEdits(
          Object.fromEntries(body.drafts.map((draft) => [draft.id, draft.text]))
        )
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load comments"
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [collectionId])

  async function load(id = collectionId) {
    const body = await fetchQueue(id)
    setQueue(body)
    setEdits(
      Object.fromEntries(
        body.drafts.map((draft: TikTokCommentReplyDraft) => [
          draft.id,
          draft.text,
        ])
      )
    )
  }

  const approved = useMemo(
    () => new Set(queue.approvals.map((item) => item.draftId)),
    [queue.approvals]
  )
  // Approve all means every pending draft, flagged ones included — withholding
  // them would quietly leave comments unanswered. Flagged rows instead force a
  // second press so nobody ships a reply to a hostile comment by reflex.
  const approveAll = queue.drafts.filter(
    (draft) => !approved.has(draft.id) && !skipped.has(draft.id)
  )
  const carefulPending = approveAll.filter((draft) => draft.careful).length

  async function approve(drafts: TikTokCommentReplyDraft[]) {
    if (!drafts.length) return
    setBusy(true)
    try {
      await action({
        action: "approve",
        collectionId,
        approvals: drafts.map((draft) => ({
          draftId: draft.id,
          text: edits[draft.id] || draft.text,
          heart: hearts[draft.id] === true,
        })),
      })
      await load()
      toast.success(
        `${drafts.length} reply${drafts.length === 1 ? "" : "ies"} approved`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed")
    } finally {
      setBusy(false)
    }
  }

  async function sendApproved() {
    setBusy(true)
    try {
      const current = queue.approvals.map((item) => item.draftId)
      await action({
        action: "send",
        collectionId,
        draftIds: current,
        confirmSend: true,
      })
      toast.success(
        `Queued ${current.length} approved replies with paced posting`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Send failed")
    } finally {
      setBusy(false)
    }
  }

  if (!collectionId) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 text-app-text">
        <header>
          <p className="text-role-label text-app-muted-text">TikTok comments</p>
          <h1 className="text-metric font-semibold tracking-tight">Comments</h1>
          <p className="text-role-label mt-2 max-w-2xl text-app-muted-text">
            Collect top-level comments from a published TikTok, review every
            drafted reply, then explicitly approve what can be sent.
          </p>
        </header>

        <section className="rounded-card border border-app-panel-border bg-app-surface p-6">
          <div className="flex size-10 items-center justify-center rounded-control bg-app-surface-subtle text-app-text">
            <IconBrandTiktok className="size-5" />
          </div>
          <h2 className="text-role-heading mt-4">Start from post analytics</h2>
          <p className="text-role-label mt-2 max-w-2xl text-app-muted-text">
            Open a TikTok publication in Analytics and choose Collect comments.
            LumenClip needs that publication record to identify the TikTok post.
          </p>
          <Button asChild variant="action" size="appDefault" className="mt-5">
            <Link href="/app/analytics">
              <IconMessageCircle className="size-4" />
              Open Analytics
            </Link>
          </Button>
        </section>

        <section>
          <h2 className="text-role-heading">Recent collections</h2>
          <div className="mt-3 space-y-2">
            {recentCollections.map((collection) => (
              <Link
                key={collection.id}
                href={`/app/tiktok-comments?collectionId=${encodeURIComponent(collection.id)}`}
                className="lc-focus-ring flex items-center justify-between gap-4 rounded-control border border-app-panel-border bg-app-surface px-4 py-3 transition hover:bg-app-control-hover"
              >
                <span className="min-w-0">
                  <span className="text-role-label block truncate text-app-text">
                    {collection.posts.length} TikTok post
                    {collection.posts.length === 1 ? "" : "s"}
                  </span>
                  <span className="mt-1 block text-caption text-app-muted-text">
                    {formatCollectionDate(collection.updatedAt)}
                  </span>
                </span>
                <span className="rounded-full bg-app-surface-subtle px-2.5 py-1 text-caption font-medium text-app-muted-text">
                  {collection.status}
                </span>
              </Link>
            ))}
            {!loading && !recentCollections.length && !loadError ? (
              <p className="text-role-label rounded-control border border-dashed border-app-panel-border px-4 py-6 text-app-muted-text">
                No comment collections yet. The first one will appear here after
                you start it from Analytics.
              </p>
            ) : null}
            {loading ? (
              <p className="text-role-label text-app-muted-text">
                Loading recent collections…
              </p>
            ) : null}
            {loadError ? (
              <p role="alert" className="text-role-label text-app-danger">
                {loadError}
              </p>
            ) : null}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 text-app-text">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-role-label text-app-muted-text">TikTok comments</p>
          <h1 className="text-metric font-semibold tracking-tight">
            Reply approval queue
          </h1>
          <p className="text-role-label mt-2 text-app-muted-text">
            Every comment has a draft. Approved replies post slowly;{" "}
            {queue.approvals.length || 0} selected will take roughly{" "}
            {Math.max(1, queue.approvals.length)}–
            {Math.max(2, queue.approvals.length * 2)} minutes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || !approveAll.length}
            onClick={() => {
              if (carefulPending && !confirmingApproveAll) {
                setConfirmingApproveAll(true)
                return
              }
              setConfirmingApproveAll(false)
              void approve(approveAll)
            }}
          >
            {confirmingApproveAll
              ? `Approve ${approveAll.length}, including ${carefulPending} flagged?`
              : `Approve all (${approveAll.length})`}
          </Button>
          <Button
            disabled={busy || !queue.approvals.length}
            onClick={() => void sendApproved()}
          >
            <IconSend /> Send approved ({queue.approvals.length})
          </Button>
        </div>
      </header>

      {loadError ? (
        <section
          role="alert"
          className="text-role-label rounded-control border border-app-danger bg-app-surface p-4 text-app-danger"
        >
          {loadError}
        </section>
      ) : null}

      {!loading && !loadError && !queue.drafts.length ? (
        <section className="rounded-card border border-dashed border-app-panel-border bg-app-surface p-8 text-center">
          <IconMessageCircle className="mx-auto size-6 text-app-muted-text" />
          <h2 className="text-role-heading mt-4">Waiting for reply drafts</h2>
          <p className="text-role-label mx-auto mt-2 max-w-xl text-app-muted-text">
            This collection is ready to receive captured comments. Drafted
            replies will appear here for approval; nothing can be sent before an
            approval record exists.
          </p>
        </section>
      ) : null}

      {loading ? (
        <p className="text-role-label text-app-muted-text">
          Loading approval queue…
        </p>
      ) : null}

      <section className="space-y-3">
        {queue.drafts.map((draft) => {
          const comment = queue.comments.find(
            (item) => item.id === draft.commentId
          )
          const isApproved = approved.has(draft.id)
          const isSkipped = skipped.has(draft.id)
          return (
            <article
              key={draft.id}
              className={`rounded-card border p-4 ${draft.careful ? "border-app-warning bg-app-warning-surface" : "border-app-panel-border bg-app-surface"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{comment?.displayName || comment?.handle}</strong>
                    <span className="rounded-full bg-app-surface-subtle px-2 py-0.5 text-caption text-app-muted-text">
                      {draft.style}
                    </span>
                    {draft.careful && (
                      <span className="flex items-center gap-1 text-caption font-medium text-app-warning">
                        <IconAlertTriangle size={14} /> Read before approving
                      </span>
                    )}
                  </div>
                  <p className="text-role-label mt-2 text-app-text-soft">
                    {comment?.text}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Heart comment"
                  aria-pressed={hearts[draft.id] === true}
                  onClick={() =>
                    setHearts((value) => ({
                      ...value,
                      [draft.id]: !value[draft.id],
                    }))
                  }
                  className="lc-focus-ring rounded-full p-2 text-app-muted-text hover:bg-app-control-hover aria-pressed:text-app-danger"
                >
                  <IconHeart
                    fill={hearts[draft.id] ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <textarea
                value={edits[draft.id] ?? draft.text}
                disabled={isApproved || isSkipped}
                onChange={(event) =>
                  setEdits((value) => ({
                    ...value,
                    [draft.id]: event.target.value,
                  }))
                }
                className="text-role-label mt-4 min-h-20 w-full rounded-control border border-app-panel-border bg-app-control-bg p-3 outline-none focus:border-app-panel-border-strong"
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={isApproved}
                  onClick={() =>
                    setSkipped((value) => new Set(value).add(draft.id))
                  }
                >
                  {isSkipped ? "Skipped" : "Skip"}
                </Button>
                <Button
                  disabled={
                    busy ||
                    isApproved ||
                    isSkipped ||
                    !(edits[draft.id] || "").trim()
                  }
                  onClick={() => void approve([draft])}
                >
                  {isApproved ? "Approved" : "Approve"}
                </Button>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}

async function action(body: object) {
  const response = await fetch("/api/tiktok-comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || "Request failed")
  return result
}

async function fetchQueue(collectionId: string): Promise<Queue> {
  const response = await fetch(
    `/api/tiktok-comments?collectionId=${encodeURIComponent(collectionId)}`
  )
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error || "Could not load approval queue")
  return body
}

async function fetchApprovalPage(
  collectionId: string
): Promise<Queue | { collections: TikTokCommentCollection[] }> {
  return collectionId
    ? await fetchQueue(collectionId)
    : await fetchRecentCollections()
}

async function fetchRecentCollections(): Promise<{
  collections: TikTokCommentCollection[]
}> {
  const response = await fetch("/api/tiktok-comments")
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error || "Could not load recent collections")
  return body
}

function formatCollectionDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "Recently updated"
    : `Updated ${date.toLocaleDateString()}`
}
