import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PostFastPostRecord } from "@/lib/postfast-posts"

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
    failLegacyUpdate: false,
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
        if (tableId === "outputs" && mocks.failLegacyUpdate) {
          throw new Error("legacy output update failed")
        }
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

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ $id: "owner-1" }),
}))

vi.mock("@/lib/system-owner-context", () => ({
  systemOwnerId: () => null,
}))

import {
  PostDualWriteError,
  writeOutputPublications,
} from "@/lib/output-publications"
import { POSTS_TABLE } from "@/lib/post-repository-appwrite"

describe("output publication dual-write", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows.clear()
    mocks.failLegacyUpdate = false
    process.env.POST_REPOSITORY_WRITE_MODE = "dual"
    mocks.rows.set(
      "outputs",
      new Map([
        [
          "output-1",
          {
            $id: "output-1",
            owner_id: "owner-1",
            rid: "result-1",
            source_key: "result",
            source_entity_id: "native-1",
            publications: "[]",
          },
        ],
      ])
    )
  })

  afterEach(() => {
    delete process.env.POST_REPOSITORY_WRITE_MODE
  })

  it("writes a canonical post and the legacy output summary", async () => {
    await writeOutputPublications([publication()])

    const canonical = [...(mocks.rows.get(POSTS_TABLE)?.values() ?? [])]
    const output = mocks.rows.get("outputs")?.get("output-1")
    expect(canonical).toHaveLength(1)
    expect(canonical[0]).toMatchObject({
      owner_id: "owner-1",
      rid: "publication-1",
      write_state: "reconciled",
    })
    expect(JSON.parse(String(output?.publications))).toEqual([publication()])
    expect(output).toMatchObject({
      publication_status: "published",
      published_at: "2026-07-29T00:00:00.000Z",
      primary_post_id: "postfast-1",
      primary_release_url:
        "https://www.tiktok.com/@creator/video/native-1",
    })
  })

  it("marks a retryable canonical repair when the legacy side fails", async () => {
    mocks.failLegacyUpdate = true

    await expect(
      writeOutputPublications([publication()])
    ).rejects.toBeInstanceOf(PostDualWriteError)

    const canonical = [...(mocks.rows.get(POSTS_TABLE)?.values() ?? [])]
    expect(canonical).toHaveLength(1)
    expect(canonical[0]).toMatchObject({
      write_state: "repair_required",
      reconciled_at: null,
    })
    expect(JSON.parse(String(canonical[0].repair_data))).toMatchObject({
      operation: "dual_write",
      target: "legacy_output_publications",
      retryable: true,
      message: "legacy output update failed",
    })
  })
})

function publication(): PostFastPostRecord {
  return {
    id: "publication-1",
    sourceType: "external",
    sourceId: "native-1",
    postfastPostId: "postfast-1",
    integrationId: "integration-1",
    provider: "tiktok",
    status: "published",
    publishedAt: "2026-07-29T00:00:00.000Z",
    releaseUrl: "https://www.tiktok.com/@creator/video/native-1",
    linkState: "manually_linked",
    statsSources: ["postfast"],
    externalPostId: "native-1",
    content: "Published post",
    media: [],
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  }
}
