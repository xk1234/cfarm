"use client"

import { useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconHeart, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type {
  CapturedTikTokComment,
  TikTokCommentReplyApproval,
  TikTokCommentReplyDraft,
} from "@/lib/tiktok-comments"

type Queue = {
  comments: CapturedTikTokComment[]
  drafts: TikTokCommentReplyDraft[]
  approvals: TikTokCommentReplyApproval[]
}

export default function TikTokCommentApprovalPage() {
  const [collectionId, setCollectionId] = useState("")
  const [queue, setQueue] = useState<Queue>({
    comments: [],
    drafts: [],
    approvals: [],
  })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [hearts, setHearts] = useState<Record<string, boolean>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmingApproveAll, setConfirmingApproveAll] = useState(false)

  useEffect(() => {
    const id =
      new URLSearchParams(window.location.search).get("collectionId") || ""
    void Promise.resolve().then(async () => {
      setCollectionId(id)
      if (!id) return
      const body = await fetchQueue(id)
      setQueue(body)
      setEdits(
        Object.fromEntries(body.drafts.map((draft) => [draft.id, draft.text]))
      )
    })
  }, [])

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
      <main className="p-8 text-app-muted-text">
        Open this queue with a collectionId query parameter.
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-app-text">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-app-muted-text">TikTok comments</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Reply approval queue
          </h1>
          <p className="mt-2 text-sm text-app-muted-text">
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
              className={`rounded-xl border p-4 ${draft.careful ? "border-app-warning bg-app-warning-surface" : "border-app-panel-border bg-app-surface"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{comment?.displayName || comment?.handle}</strong>
                    <span className="rounded-full bg-app-surface-subtle px-2 py-0.5 text-xs text-app-muted-text">
                      {draft.style}
                    </span>
                    {draft.careful && (
                      <span className="flex items-center gap-1 text-xs font-medium text-app-warning">
                        <IconAlertTriangle size={14} /> Read before approving
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-app-text-soft">
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
                  className="rounded-full p-2 text-app-muted-text hover:bg-app-control-hover aria-pressed:text-app-danger"
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
                className="mt-4 min-h-20 w-full rounded-lg border border-app-panel-border bg-app-control-bg p-3 text-sm outline-none focus:border-app-panel-border-strong"
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
