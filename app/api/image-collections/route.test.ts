import path from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { writeJsonArrayStore } from "@/lib/json-store"

type StoreInput = {
  fileName: string
  normalize?: (record: never) => unknown
}

const memory = vi.hoisted(() => ({
  stores: new Map<string, unknown[]>(),
}))

vi.mock("@/lib/json-store", () => ({
  readJsonArrayStore: vi.fn(async (input: StoreInput) =>
    (memory.stores.get(input.fileName) ?? []).flatMap((record) => {
      const normalized = input.normalize
        ? input.normalize(structuredClone(record) as never)
        : structuredClone(record)
      return normalized == null ? [] : [normalized]
    })
  ),
  writeJsonArrayStore: vi.fn(
    async (input: StoreInput & { records: unknown[] }) => {
      memory.stores.set(input.fileName, structuredClone(input.records))
    }
  ),
  appendJsonArrayRecords: vi.fn(
    async (input: StoreInput & { records: unknown[] }) => {
      memory.stores.set(input.fileName, [
        ...(memory.stores.get(input.fileName) ?? []),
        ...structuredClone(input.records),
      ])
    }
  ),
  withJsonArrayStore: vi.fn(
    async (
      input: StoreInput & {
        update: (records: unknown[]) => Promise<{
          records: unknown[]
          result?: unknown
        }>
      }
    ) => {
      const next = await input.update(
        structuredClone(memory.stores.get(input.fileName) ?? [])
      )
      memory.stores.set(input.fileName, structuredClone(next.records))
      return next.result
    }
  ),
}))

vi.mock("@/lib/influlab", () => ({
  listCurrentInfluLabCollections: vi.fn(async () => []),
}))

beforeEach(() => {
  memory.stores.clear()
  vi.resetModules()
})

describe("GET /api/image-collections", () => {
  it("includes per-image last-used dates from the usage ledger", async () => {
    await writeJsonArrayStore({
      rootDir: path.join(process.cwd(), "data"),
      fileName: "image-collections.json",
      key: "collections",
      records: [
        {
          name: "Used images",
          created_at: "2026-07-03T01:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/used.jpg",
              caption: "Used",
              hash: "hash-used",
            },
          ],
        },
      ],
    })
    const { appendUsageRecords } = await import("@/lib/usage-ledger")
    await appendUsageRecords({
      rootDir: path.join(process.cwd(), "data"),
      records: [
        {
          automation_id: "automation-a",
          kind: "image",
          key: "hash-used",
          run_id: "run-used",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
      now: new Date("2026-07-07T10:00:00.000Z"),
    })

    const { GET } = await import("./route")
    const response = await GET()
    const payload = await response.json()

    expect(payload.collections[0].images[0]).toMatchObject({
      image_link: "/api/local-assets/image-collections/files/used.jpg",
      hash: "hash-used",
      last_used_at: "2026-07-07T10:00:00.000Z",
    })
  })
})
