import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { withSystemOwner } from "@/lib/system-owner-context"
import {
  buildViralBaseline,
  createViralProject,
  getViralAccount,
  getViralProject,
  listViralAccounts,
  listViralPosts,
  listViralProjects,
  removeViralAccount,
  removeViralProject,
  saveViralAccount,
  type ViralTrackerAccount,
} from "@/lib/viral-tracker"
import {
  fetchTikHubProfile,
  fetchTikHubUserPosts,
  normalizeTikTokHandle,
} from "@/lib/tikhub"
import { pollViralAccount } from "@/lib/viral-tracker-poller"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const createProjectSchema = z.object({
  action: z.literal("create_project"),
  name: z.string().trim().min(1).max(120),
  telegramChatId: z.string().trim().max(120).optional(),
})

const addAccountSchema = z.object({
  action: z.literal("add_account"),
  projectId: z.string().uuid(),
  handle: z.string().trim().min(1).max(500),
})

const accountStatusSchema = z.object({
  action: z.literal("set_account_status"),
  accountId: z.string().uuid(),
  status: z.enum(["active", "paused"]),
})

const pollAccountSchema = z.object({
  action: z.literal("poll_account"),
  accountId: z.string().uuid(),
})

const deleteSchema = z.object({
  kind: z.enum(["project", "account"]),
  id: z.string().uuid(),
})

export const GET = withHandler(async () => {
  const user = await requireUser()
  return NextResponse.json(
    await withSystemOwner(user.$id, async () => {
      const [projects, accounts, posts] = await Promise.all([
        listViralProjects(),
        listViralAccounts(),
        listViralPosts(),
      ])
      return {
        projects: projects.sort(byUpdatedAt),
        accounts: accounts.sort(byUpdatedAt),
        posts: posts.sort(
          (left, right) =>
            Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
        ),
        configuration: {
          tikhub: Boolean(process.env.TIKHUB_API_KEY?.trim()),
          telegram: Boolean(
            process.env.TELEGRAM_BOT_TOKEN?.trim() &&
            process.env.TELEGRAM_CHAT_ID?.trim()
          ),
          transcription: Boolean(
            process.env.FAL_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
          ),
        },
      }
    })
  )
})

export const POST = withHandler(async (request: Request) => {
  const user = await requireUser()
  const body = await request.json().catch(() => null)

  if (body?.action === "create_project") {
    const input = validate(createProjectSchema, body)
    return NextResponse.json(
      {
        project: await withSystemOwner(user.$id, () =>
          createViralProject(input)
        ),
      },
      { status: 201 }
    )
  }

  if (body?.action === "add_account") {
    const input = validate(addAccountSchema, body)
    const handle = normalizeTikTokHandle(input.handle)
    if (!handle) throw new ApiError(400, "Enter a valid TikTok handle")
    const account = await withSystemOwner(user.$id, async () => {
      const project = await getViralProject(input.projectId)
      if (!project) throw new ApiError(404, "Project not found")
      const current = await listViralAccounts()
      if (
        current.some(
          (item) =>
            item.projectId === project.id &&
            item.handle.toLowerCase() === handle.toLowerCase()
        )
      ) {
        throw new ApiError(409, `@${handle} is already in this project`)
      }
      const [profile, posts] = await Promise.all([
        fetchTikHubProfile(handle),
        fetchTikHubUserPosts({ handle, count: 10 }),
      ])
      const now = new Date()
      const baselinePosts = posts.slice(0, 10)
      if (!baselinePosts.length) {
        throw new ApiError(
          422,
          `TikHub returned no public posts for @${handle}`
        )
      }
      const record: ViralTrackerAccount = {
        id: randomUUID(),
        projectId: project.id,
        platform: "tiktok",
        handle: profile.handle || handle,
        displayName: profile.displayName || handle,
        avatarUrl: profile.avatarUrl,
        profileUrl: `https://www.tiktok.com/@${encodeURIComponent(profile.handle || handle)}`,
        externalUserId: profile.externalUserId,
        secUserId: profile.secUserId,
        status: "active",
        baseline: buildViralBaseline(baselinePosts, now.toISOString()),
        baselinePosts,
        thresholdMultiplier: 3,
        knownPostIds: baselinePosts.map((post) => post.externalPostId),
        nextPollAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }
      return saveViralAccount(record)
    })
    return NextResponse.json({ account }, { status: 201 })
  }

  if (body?.action === "set_account_status") {
    const input = validate(accountStatusSchema, body)
    const account = await withSystemOwner(user.$id, async () => {
      const current = await getViralAccount(input.accountId)
      if (!current) throw new ApiError(404, "Account not found")
      return saveViralAccount({
        ...current,
        status: input.status,
        updatedAt: new Date().toISOString(),
      })
    })
    return NextResponse.json({ account })
  }

  if (body?.action === "poll_account") {
    const input = validate(pollAccountSchema, body)
    const result = await withSystemOwner(user.$id, async () => {
      const current = await getViralAccount(input.accountId)
      if (!current) throw new ApiError(404, "Account not found")
      return pollViralAccount(current.id)
    })
    return NextResponse.json(result)
  }

  throw new ApiError(400, "Unknown viral tracker action")
})

export const DELETE = withHandler(async (request: Request) => {
  const user = await requireUser()
  const input = validate(
    deleteSchema,
    Object.fromEntries(new URL(request.url).searchParams)
  )
  const removed = await withSystemOwner(user.$id, () =>
    input.kind === "project"
      ? removeViralProject(input.id)
      : removeViralAccount(input.id)
  )
  return NextResponse.json({ removed })
})

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication required")
  return user
}

function byUpdatedAt(
  left: { updatedAt: string },
  right: { updatedAt: string }
) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}
