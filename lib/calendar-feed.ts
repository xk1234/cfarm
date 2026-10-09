/**
 * Server-side calendar projection: `posts` rows in a date range, joined with
 * their renders (title, cover) and SocialBu account names.
 */
import "server-only"

import { getRepositories, type Repositories, type WorkspaceId } from "@/lib/data"
import {
  calendarItemFromPost,
  calendarSummary,
  sortCalendarItems,
  type CalendarItem,
  type CalendarRenderContext,
  type CalendarSummary,
} from "@/lib/calendar-items"
import { getPublisher, type Publisher } from "@/lib/publishing/publisher"

export type CalendarFeedDeps = { repos?: Repositories; publisher?: Publisher }

/** Longest range one request may ask for. */
export const MAX_CALENDAR_RANGE_DAYS = 62

export async function listCalendarItems(
  workspaceId: WorkspaceId,
  range: { from: string; to: string },
  deps: CalendarFeedDeps = {}
): Promise<{ items: CalendarItem[]; summary: CalendarSummary }> {
  const repos = deps.repos ?? getRepositories()
  const publisher = deps.publisher ?? getPublisher()
  const [posts, settings] = await Promise.all([
    repos.posts.listRange(workspaceId, range),
    repos.settings.get(workspaceId),
  ])

  const renderIds = [...new Set(posts.map((post) => post.renderId))]
  const renders = new Map<string, CalendarRenderContext>()
  await Promise.all(
    renderIds.map(async (id) => {
      const render = await repos.renders.get(workspaceId, id)
      if (!render) return
      renders.set(id, {
        id: render.id,
        title: render.title,
        createdAt: render.createdAt,
        completedAt: render.completedAt,
        ...(render.output?.coverFileId
          ? { previewUrl: `/api/files/renders/${encodeURIComponent(render.output.coverFileId)}` }
          : {}),
      })
    })
  )

  const accountNames = new Map<string, string>()
  if (posts.length && publisher.configured) {
    const accounts = await publisher.listAccounts().catch(() => [])
    for (const account of accounts) accountNames.set(account.id, account.name)
  }

  const items = sortCalendarItems(
    posts.flatMap((post) => {
      const item = calendarItemFromPost(post, {
        render: renders.get(post.renderId) ?? null,
        accountName: accountNames.get(post.accountId),
        timezone: settings.timezone,
      })
      return item ? [item] : []
    })
  )
  return { items, summary: calendarSummary(items) }
}
