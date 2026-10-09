/**
 * Home-screen alert counts: failed posts and posts scheduled in the next week.
 */
import "server-only"

import { getRepositories, type Repositories, type WorkspaceId } from "@/lib/data"

export type CalendarAlertSummary = {
  /** Kept for the home view; nothing needs manual action with SocialBu. */
  needsAction: number
  /** Failed posts in the last 30 days. */
  failed: number
  /** Posts scheduled in the next 7 days. */
  upcoming: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function calendarAlertSummary(
  workspaceId: WorkspaceId,
  deps: { repos?: Repositories; now?: () => Date } = {}
): Promise<CalendarAlertSummary> {
  const repos = deps.repos ?? getRepositories()
  const now = (deps.now ?? (() => new Date()))().getTime()
  const posts = await repos.posts.listRange(workspaceId, {
    from: new Date(now - 30 * DAY_MS).toISOString(),
    to: new Date(now + 7 * DAY_MS).toISOString(),
  })
  return {
    needsAction: 0,
    failed: posts.filter((post) => post.status === "failed").length,
    upcoming: posts.filter(
      (post) => post.status === "scheduled" && !!post.publishAt && Date.parse(post.publishAt) >= now
    ).length,
  }
}
