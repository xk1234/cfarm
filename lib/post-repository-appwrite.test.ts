import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Post } from "@/lib/posts"

const mocks = vi.hoisted(() => {
  const rows = new Map<string, Map<string, Record<string, unknown>>>()
  const table = (id: string) => {
    let current = rows.get(id)
    if (!current) {
      current = new Map()
      rows.set(id, current)
    }
    return current
  }
  const missing = () => Object.assign(new Error("missing"), { code: 404 })
  const conflict = () => Object.assign(new Error("conflict"), { code: 409 })
  return {
    rows,
    getRow: vi.fn(async (_databaseId: string, tableId: string, rowId: string) => {
      const row = table(tableId).get(rowId)
      if (!row) throw missing()
      return row
    }),
    createRow: vi.fn(
      async (
        _databaseId: string,
        tableId: string,
        rowId: string,
        data: Record<string, unknown>
      ) => {
        if (table(tableId).has(rowId)) throw conflict()
        const row = { $id: rowId, ...data }
        table(tableId).set(rowId, row)
        return row
      }
    ),
    upsertRow: vi.fn(
      async (
        _databaseId: string,
        tableId: string,
        rowId: string,
        data: Record<string, unknown>
      ) => {
        const row = { ...table(tableId).get(rowId), $id: rowId, ...data }
        table(tableId).set(rowId, row)
        return row
      }
    ),
    updateRow: vi.fn(
      async (
        _databaseId: string,
        tableId: string,
        rowId: string,
        data: Record<string, unknown>
      ) => {
        const current = table(tableId).get(rowId)
        if (!current) throw missing()
        const row = { ...current, ...data }
        table(tableId).set(rowId, row)
        return row
      }
    ),
    listRows: vi.fn(
      async (_databaseId: string, tableId: string, queries: string[]) => {
        let values = [...table(tableId).values()]
        for (const queryValue of queries) {
          const query = JSON.parse(queryValue) as {
            method: string
            attribute?: string
            values?: unknown[]
          }
          if (query.method !== "equal" || !query.attribute) continue
          const attribute = query.attribute
          values = values.filter((row) =>
            query.values?.includes(row[attribute])
          )
        }
        return { rows: values, total: values.length }
      }
    ),
  }
})

vi.mock("@/lib/appwrite", () => ({
  APPWRITE_DATABASE_ID: "cfarm",
  getAppwrite: () => ({
    tables: {
      getRow: mocks.getRow,
      createRow: mocks.createRow,
      upsertRow: mocks.upsertRow,
      updateRow: mocks.updateRow,
      listRows: mocks.listRows,
    },
  }),
}))

import {
  AppwritePostRepository,
  POST_IDENTITIES_TABLE,
  POSTS_TABLE,
} from "@/lib/post-repository-appwrite"

describe("AppwritePostRepository identity claims", () => {
  const repository = new AppwritePostRepository()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows.clear()
  })

  it("converges concurrent upserts for the same intent to one post row", async () => {
    const [first, second] = await Promise.all([
      repository.upsertPost(post({ id: "post-a", intentId: "intent-shared" })),
      repository.upsertPost(post({ id: "post-b", intentId: "intent-shared" })),
    ])

    expect(second.id).toBe(first.id)
    expect(mocks.rows.get(POSTS_TABLE)?.size).toBe(1)
    expect(await repository.listPosts("owner-1")).toHaveLength(1)
  })

  it("converges concurrent upserts for the same external identity", async () => {
    const [first, second] = await Promise.all([
      repository.upsertPost(
        post({
          id: "post-a",
          intentId: "intent-a",
          externalPostId: "native-42",
        })
      ),
      repository.upsertPost(
        post({
          id: "post-b",
          intentId: "intent-b",
          externalPostId: "native-42",
        })
      ),
    ])

    expect(second.id).toBe(first.id)
    expect(mocks.rows.get(POSTS_TABLE)?.size).toBe(1)
    expect(mocks.rows.get(POST_IDENTITIES_TABLE)?.size).toBeGreaterThan(1)
  })

  it("rejects supplied claims that resolve to different posts", async () => {
    await repository.upsertPost(
      post({
        id: "post-a",
        intentId: "intent-a",
        postfastPostId: "postfast-a",
        externalPostId: "native-a",
      })
    )
    await repository.upsertPost(
      post({
        id: "post-b",
        intentId: "intent-b",
        postfastPostId: "postfast-b",
        externalPostId: "native-b",
      })
    )

    await expect(
      repository.upsertPost(
        post({
          id: "post-c",
          intentId: "intent-c",
          postfastPostId: "postfast-a",
          externalPostId: "native-b",
        })
      )
    ).rejects.toMatchObject({
      name: "PostIdentityConflictError",
      code: "post_identity_conflict",
    })
    expect(mocks.rows.get(POSTS_TABLE)?.size).toBe(2)
  })

  it("keeps an owner-scoped PostFast claim stable across reconnects", async () => {
    const first = await repository.upsertPost(
      post({
        id: "post-a",
        intentId: "intent-a",
        postfastPostId: "postfast-a",
        externalPostId: "native-a",
      })
    )
    const reconnected = await repository.upsertPost(
      post({
        id: "post-b",
        intentId: "intent-b",
        integrationId: "integration-2",
        postfastPostId: "postfast-a",
        externalPostId: "native-a",
      })
    )

    expect(reconnected).toMatchObject({
      id: first.id,
      integrationId: "integration-2",
      postfastPostId: "postfast-a",
    })
    expect(mocks.rows.get(POSTS_TABLE)?.size).toBe(1)
  })

  it("patches one canonical row and resolves a losing id as an alias", async () => {
    const first = await repository.upsertPost(
      post({ id: "post-a", intentId: "intent-shared" })
    )
    const aliased = await repository.upsertPost(
      post({ id: "post-b", intentId: "intent-shared" })
    )

    await expect(repository.getPost("owner-1", "post-b")).resolves.toMatchObject(
      { id: first.id }
    )
    await expect(
      repository.patchPost("owner-1", aliased.id, { content: "Patched" })
    ).resolves.toMatchObject({ id: first.id, content: "Patched" })
    expect(mocks.rows.get(POSTS_TABLE)?.size).toBe(1)
  })
})

function post(overrides: Partial<Post> = {}): Post {
  return {
    schemaVersion: 1,
    id: "post-1",
    intentId: "intent-1",
    ownerId: "owner-1",
    origin: "postfast_sync",
    sourceType: "external",
    sourceId: "native-1",
    sourceRefs: [{ kind: "external", id: "native-1" }],
    lifecycleStatus: "published",
    linkState: "externally_linked",
    linkMethod: "analytics_sync",
    integrationId: "integration-1",
    provider: "tiktok",
    releaseUrl: "https://www.tiktok.com/@creator/video/native-1",
    statsSources: ["postfast"],
    content: "Canonical post",
    hashtags: [],
    media: [],
    publishedAt: "2026-07-29T00:00:00.000Z",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  }
}
