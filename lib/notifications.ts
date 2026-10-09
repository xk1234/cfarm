/**
 * In-app notifications (the only channel). Rows live in the `notifications`
 * table; a notification due now is delivered immediately, a future one (post
 * reminders) gets a `notify` job at its `deliverAt`. The worker can also sweep
 * stragglers with `deliverDueNotifications`.
 *
 * Workspace reminder settings (`in_app` | `none`) gate every notification.
 */
import {
  getRepositories,
  type Notification,
  type NotificationEvent,
  type Page,
  type Post,
  type Render,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"

export type NotificationDeps = {
  repos?: Repositories
  now?: () => Date
}

function resolve(deps: NotificationDeps = {}) {
  return { repos: deps.repos ?? getRepositories(), now: deps.now ?? (() => new Date()) }
}

export type EmitNotificationInput = {
  event: NotificationEvent
  title: string
  body?: string | null
  postId?: string | null
  renderId?: string | null
  /** Unique per workspace; a repeat emit returns the existing row. */
  dedupeKey: string
  /** Default now. */
  deliverAt?: string
}

/**
 * Records an in-app notification unless the workspace turned notifications
 * off. Returns null when suppressed.
 */
export async function emitNotification(
  workspaceId: WorkspaceId,
  input: EmitNotificationInput,
  deps: NotificationDeps = {}
): Promise<Notification | null> {
  const { repos, now } = resolve(deps)
  const settings = await repos.settings.get(workspaceId)
  if (!settings.reminders.enabled) return null

  const nowIso = now().toISOString()
  const deliverAt = input.deliverAt ?? nowIso
  const { value, created } = await repos.notifications.schedule(workspaceId, {
    event: input.event,
    title: input.title,
    body: input.body ?? null,
    postId: input.postId ?? null,
    renderId: input.renderId ?? null,
    deliverAt,
    dedupeKey: input.dedupeKey,
  })
  if (!created || value.status !== "pending") return value
  if (deliverAt <= nowIso) return repos.notifications.markDelivered(workspaceId, value.id)

  await repos.jobs.enqueue({
    workspaceId,
    type: "notify",
    payload: { notificationId: value.id },
    runAt: deliverAt,
    dedupeKey: `notify:${value.id}`,
  })
  return value
}

/** Called when a render reaches `succeeded` or `failed`. */
export async function notifyRenderFinished(
  workspaceId: WorkspaceId,
  render: Pick<Render, "id" | "status" | "title" | "error" | "slideCount">,
  deps: NotificationDeps = {}
): Promise<Notification | null> {
  if (render.status !== "succeeded" && render.status !== "failed") return null
  const name = render.title?.trim() || "Slideshow"
  const succeeded = render.status === "succeeded"
  return emitNotification(
    workspaceId,
    {
      event: succeeded ? "render.succeeded" : "render.failed",
      title: succeeded ? `${name} rendered` : `${name} failed to render`,
      body: succeeded
        ? `${render.slideCount} slide${render.slideCount === 1 ? "" : "s"} ready.`
        : render.error || "The render failed.",
      renderId: render.id,
      dedupeKey: `render:${render.id}:${render.status}`,
    },
    deps
  )
}

export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    tiktok: "TikTok",
    instagram: "Instagram",
    facebook: "Facebook",
    x: "X",
    linkedin: "LinkedIn",
    threads: "Threads",
    pinterest: "Pinterest",
    youtube: "YouTube",
    bluesky: "Bluesky",
    mastodon: "Mastodon",
    reddit: "Reddit",
    "google-business-profile": "Google Business Profile",
  }
  return labels[provider] ?? (provider ? provider[0]!.toUpperCase() + provider.slice(1) : "Social")
}

/** Called when a post reaches `published` or `failed`. */
export async function notifyPostOutcome(
  workspaceId: WorkspaceId,
  post: Pick<Post, "id" | "status" | "provider" | "renderId" | "error" | "permalink">,
  deps: NotificationDeps = {}
): Promise<Notification | null> {
  if (post.status !== "published" && post.status !== "failed") return null
  const network = providerLabel(post.provider)
  const published = post.status === "published"
  return emitNotification(
    workspaceId,
    {
      event: published ? "post.published" : "post.failed",
      title: published ? `Published to ${network}` : `${network} post failed`,
      body: published ? post.permalink : post.error || "SocialBu could not publish the post.",
      postId: post.id,
      renderId: post.renderId,
      dedupeKey: `post:${post.id}:${post.status}`,
    },
    deps
  )
}

/** Schedules `post.upcoming` reminders `leadMinutes` before a scheduled post. */
export async function schedulePostReminders(
  workspaceId: WorkspaceId,
  post: Pick<Post, "id" | "status" | "provider" | "renderId" | "publishAt">,
  deps: NotificationDeps = {}
): Promise<Notification[]> {
  const { repos, now } = resolve(deps)
  if (post.status !== "scheduled" || !post.publishAt) return []
  const settings = await repos.settings.get(workspaceId)
  if (!settings.reminders.enabled) return []
  const publishMs = Date.parse(post.publishAt)
  const created: Notification[] = []
  for (const lead of settings.reminders.leadMinutes) {
    const deliverMs = publishMs - lead * 60_000
    if (!Number.isFinite(deliverMs) || deliverMs <= now().getTime()) continue
    const notification = await emitNotification(
      workspaceId,
      {
        event: "post.upcoming",
        title: `${providerLabel(post.provider)} post in ${formatLead(lead)}`,
        body: null,
        postId: post.id,
        renderId: post.renderId,
        deliverAt: new Date(deliverMs).toISOString(),
        dedupeKey: `post:${post.id}:upcoming:${post.publishAt}:${lead}`,
      },
      { repos, now }
    )
    if (notification) created.push(notification)
  }
  return created
}

function formatLead(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

/**
 * `notify` job body: delivers one pending notification once due. Reminders for
 * posts that are no longer scheduled are canceled instead.
 */
export async function deliverNotification(
  workspaceId: WorkspaceId,
  notificationId: string,
  deps: NotificationDeps = {}
): Promise<{ status: Notification["status"] | "missing" }> {
  const { repos, now } = resolve(deps)
  const notification = await repos.notifications.get(workspaceId, notificationId)
  if (!notification) return { status: "missing" }
  if (notification.status !== "pending") return { status: notification.status }
  if (notification.deliverAt > now().toISOString()) return { status: "pending" }

  if (notification.event === "post.upcoming" && notification.postId) {
    const post = await repos.posts.get(workspaceId, notification.postId)
    if (!post || post.status !== "scheduled") {
      await repos.notifications.cancelForPost(workspaceId, notification.postId)
      return { status: "canceled" }
    }
  }
  const delivered = await repos.notifications.markDelivered(workspaceId, notificationId)
  return { status: delivered.status }
}

/** Worker sweep: delivers every pending notification that is due. */
export async function deliverDueNotifications(
  deps: NotificationDeps & { limit?: number } = {}
): Promise<number> {
  const { repos, now } = resolve(deps)
  const due = await repos.notifications.listDue(now().toISOString(), deps.limit ?? 100)
  let delivered = 0
  for (const notification of due) {
    const result = await deliverNotification(notification.workspaceId, notification.id, { repos, now })
    if (result.status === "delivered") delivered++
  }
  return delivered
}

export type NotificationInbox = Page<Notification> & { unreadCount: number }

export async function listNotifications(
  workspaceId: WorkspaceId,
  query: { cursor?: string | null; limit?: number; unreadOnly?: boolean } = {},
  deps: NotificationDeps = {}
): Promise<NotificationInbox> {
  const { repos } = resolve(deps)
  const [page, unreadCount] = await Promise.all([
    repos.notifications.list(workspaceId, {
      cursor: query.cursor,
      limit: query.limit,
      ...(query.unreadOnly ? { status: "delivered" as const } : {}),
    }),
    repos.notifications.unreadCount(workspaceId),
  ])
  return { ...page, unreadCount }
}
