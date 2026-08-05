import type { AutomationRunRecord } from "@/lib/automation-runner"
import type { Post } from "@/lib/posts"
import { normalizedTextSignature } from "@/lib/text-similarity"

const MAX_PUBLICATION_DELAY_MS = 30 * 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 5 * 60 * 1000

export type PublicationOutputMatch =
  | {
      status: "matched"
      run: AutomationRunRecord
      outputId: string
      evidence: "exact_caption" | "exact_hook"
      delayMs: number
    }
  | {
      status: "skipped"
      reason:
        | "already_linked"
        | "not_tiktok"
        | "missing_content"
        | "missing_published_at"
        | "no_exact_match"
        | "ambiguous_exact_match"
    }

export type PublicationOutputReconciliation = {
  post: Post
  match: PublicationOutputMatch
  updated: boolean
}

/**
 * Finds only exact, time-bounded matches. A false negative is safer than
 * attaching analytics to the wrong generated output, so fuzzy matches remain
 * available to the existing manual TikTok publication importer instead.
 */
export function matchPublicationToAutomationRun(
  post: Pick<
    Post,
    | "provider"
    | "content"
    | "publishedAt"
    | "outputId"
    | "sourceType"
    | "sourceId"
  >,
  runs: AutomationRunRecord[]
): PublicationOutputMatch {
  if (post.provider !== "tiktok") {
    return { status: "skipped", reason: "not_tiktok" }
  }
  if (
    post.outputId ||
    (post.sourceType === "slideshow" && Boolean(post.sourceId))
  ) {
    return { status: "skipped", reason: "already_linked" }
  }

  const signature = publicationTextSignature(post.content)
  if (!signature || signature.split(" ").length < 3) {
    return { status: "skipped", reason: "missing_content" }
  }
  const publishedAt = Date.parse(post.publishedAt ?? "")
  if (!Number.isFinite(publishedAt)) {
    return { status: "skipped", reason: "missing_published_at" }
  }

  const matches = runs.flatMap((run) => {
    if (run.status !== "succeeded" || !run.slideshowId) return []
    const createdAt = Date.parse(run.createdAt)
    if (!Number.isFinite(createdAt)) return []
    const delayMs = publishedAt - createdAt
    if (delayMs < -CLOCK_SKEW_MS || delayMs > MAX_PUBLICATION_DELAY_MS) {
      return []
    }
    const caption = publicationTextSignature(run.plan.caption)
    const hook = publicationTextSignature(run.plan.hook)
    const evidence =
      caption === signature
        ? ("exact_caption" as const)
        : hook === signature
          ? ("exact_hook" as const)
          : null
    return evidence
      ? [{ run, outputId: run.slideshowId, evidence, delayMs }]
      : []
  })

  const byOutput = new Map<string, (typeof matches)[number]>()
  for (const candidate of matches.sort(
    (left, right) => left.delayMs - right.delayMs
  )) {
    if (!byOutput.has(candidate.outputId)) {
      byOutput.set(candidate.outputId, candidate)
    }
  }
  const candidates = [...byOutput.values()]
  if (candidates.length === 0) {
    return { status: "skipped", reason: "no_exact_match" }
  }
  if (candidates.length > 1) {
    return { status: "skipped", reason: "ambiguous_exact_match" }
  }
  return { status: "matched", ...candidates[0] }
}

export async function reconcileTikTokPublicationOutput(input: {
  post: Post
  runs?: AutomationRunRecord[]
  apply?: boolean
}): Promise<PublicationOutputReconciliation> {
  const runs =
    input.runs ??
    (await (
      await import("@/lib/automation-runner")
    ).listAutomationRuns({
      limit: 2_000,
      postRecords: [],
    }))
  const match = matchPublicationToAutomationRun(input.post, runs)
  if (match.status !== "matched" || input.apply === false) {
    return { post: input.post, match, updated: false }
  }

  const { patchPost } = await import("@/lib/post-repository")
  const sourceRefs = mergeSourceRefs(input.post.sourceRefs, [
    { kind: "output", id: match.outputId },
    { kind: "slideshow", id: match.outputId },
    { kind: "automation", id: match.run.automationId },
    { kind: "run", id: match.run.id },
  ])
  const updated = await patchPost(input.post.id, {
    sourceType: "slideshow",
    sourceId: match.outputId,
    sourceRefs,
    outputId: match.outputId,
    automationId: match.run.automationId,
    runId: match.run.id,
    contentType: "slideshow",
    lifecycleStatus: "published",
    linkState: "externally_linked",
  })
  if (!updated) {
    throw new Error(`Publication ${input.post.id} disappeared while linking it`)
  }
  return { post: updated, match, updated: true }
}

/** Automatic imports should survive a repair failure and retry on the next
 * Studio sync. The structured warning keeps the failure observable. */
export async function autoReconcileTikTokPublicationOutput(
  post: Post,
  runs?: AutomationRunRecord[]
) {
  try {
    return (await reconcileTikTokPublicationOutput({ post, runs })).post
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "tiktok_publication_output_reconciliation_failed",
        postId: post.id,
        externalPostId: post.externalPostId,
        error: error instanceof Error ? error.message : String(error),
      })
    )
    return post
  }
}

export function publicationTextSignature(value: string) {
  return normalizedTextSignature([
    value.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, " "),
  ])
}

function mergeSourceRefs(
  current: Post["sourceRefs"],
  incoming: Post["sourceRefs"]
) {
  return [
    ...new Map(
      [...current, ...incoming]
        .filter((reference) => reference.id)
        .map((reference) => [`${reference.kind}:${reference.id}`, reference])
    ).values(),
  ]
}
