import "server-only"

import { getCurrentUser } from "@/lib/auth"
import { getRepositories, type Repositories, type WorkspaceId } from "@/lib/data"

export type CalendarAlertSummary = {
  /** Draft posts waiting for the user to schedule or publish them. */
  needsAction: number
  /** Failed posts and failed renders in the summary window. */
  failed: number
}

const WINDOW_BACK_MS = 30 * 24 * 3600 * 1000
const WINDOW_AHEAD_MS = 90 * 24 * 3600 * 1000

export async function calendarAlertSummaryFor(
  workspaceId: WorkspaceId,
  options: { repos?: Repositories; now?: Date } = {}
): Promise<CalendarAlertSummary> {
  const repos = options.repos ?? getRepositories()
  const now = options.now ?? new Date()
  const [posts, failedRenders] = await Promise.all([
    repos.posts.listRange(workspaceId, {
      from: new Date(now.getTime() - WINDOW_BACK_MS).toISOString(),
      to: new Date(now.getTime() + WINDOW_AHEAD_MS).toISOString(),
    }),
    repos.renders.list(workspaceId, { status: "failed", limit: 100 }),
  ])
  const recentFailedRenders = failedRenders.items.filter(
    (render) => Date.parse(render.createdAt) >= now.getTime() - WINDOW_BACK_MS
  ).length
  return {
    needsAction: posts.filter((post) => post.status === "draft").length,
    failed: posts.filter((post) => post.status === "failed").length + recentFailedRenders,
  }
}

export async function calendarAlertSummary(): Promise<CalendarAlertSummary> {
  const user = await getCurrentUser()
  if (!user) return { needsAction: 0, failed: 0 }
  return calendarAlertSummaryFor(user.$id)
}
