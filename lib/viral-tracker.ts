import "server-only"

import { randomUUID } from "node:crypto"
import path from "node:path"

import {
  deleteJsonArrayRecord,
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
} from "@/lib/json-store"
import type {
  ViralTrackerAccount,
  ViralTrackerPost,
  ViralTrackerProject,
} from "@/lib/viral-tracker-math"

export {
  DEFAULT_VIRAL_MULTIPLIER,
  VIRAL_CHECKPOINT_HOURS,
  buildViralBaseline,
  checkpointSchedule,
  engagementRate,
  formatViralCheckpoint,
  median,
  qualifiesAsViral,
  viralThreshold,
} from "@/lib/viral-tracker-math"
export type {
  ViralBaseline,
  ViralBaselinePost,
  ViralCheckpoint,
  ViralMetricSet,
  ViralPostAnalysis,
  ViralTrackerAccount,
  ViralTrackerPost,
  ViralTrackerProject,
} from "@/lib/viral-tracker-math"

const rootDir = path.join(process.cwd(), "data")
const stores = {
  projects: ["viral-tracker/projects.json", "projects"],
  accounts: ["viral-tracker/accounts.json", "accounts"],
  posts: ["viral-tracker/posts.json", "posts"],
} as const

export function createViralProject(input: {
  name: string
  telegramChatId?: string
  now?: Date
}) {
  const now = (input.now ?? new Date()).toISOString()
  const project: ViralTrackerProject = {
    id: randomUUID(),
    name: input.name.trim(),
    status: "active",
    telegramChatId: input.telegramChatId?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  return save("projects", project).then(() => project)
}

export async function listViralProjects() {
  return list<ViralTrackerProject>("projects")
}

export async function listViralAccounts() {
  return list<ViralTrackerAccount>("accounts")
}

export async function listViralPosts() {
  return list<ViralTrackerPost>("posts")
}

export async function getViralProject(id: string) {
  return get<ViralTrackerProject>("projects", id)
}

export async function getViralAccount(id: string) {
  return get<ViralTrackerAccount>("accounts", id)
}

export async function getViralPost(id: string) {
  return get<ViralTrackerPost>("posts", id)
}

export async function saveViralAccount(account: ViralTrackerAccount) {
  await save("accounts", account)
  return account
}

export async function saveViralPost(post: ViralTrackerPost) {
  await save("posts", post)
  return post
}

export async function removeViralAccount(id: string) {
  const posts = await listViralPosts()
  await Promise.all(
    posts
      .filter((post) => post.accountId === id)
      .map((post) => remove("posts", post.id))
  )
  return remove("accounts", id)
}

export async function removeViralProject(id: string) {
  const accounts = await listViralAccounts()
  await Promise.all(
    accounts
      .filter((account) => account.projectId === id)
      .map((account) => removeViralAccount(account.id))
  )
  return remove("projects", id)
}

async function list<T>(kind: keyof typeof stores) {
  const [fileName, key] = stores[kind]
  return readJsonArrayStore<T>({ rootDir, fileName, key })
}

async function get<T>(kind: keyof typeof stores, id: string) {
  const [fileName, key] = stores[kind]
  return readJsonArrayRecord<T>({ rootDir, fileName, key, id })
}

async function save<T>(kind: keyof typeof stores, record: T) {
  const [fileName, key] = stores[kind]
  return upsertJsonArrayRecord<T>({
    rootDir,
    fileName,
    key,
    record,
    position: "first",
  })
}

async function remove(kind: keyof typeof stores, id: string) {
  const [fileName, key] = stores[kind]
  return deleteJsonArrayRecord({ rootDir, fileName, key, id })
}
