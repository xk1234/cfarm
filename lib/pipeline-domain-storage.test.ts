import { beforeEach, describe, expect, it, vi } from "vitest"

const appwrite = vi.hoisted(() => ({
  tables: {
    listRows: vi.fn(),
    getRow: vi.fn(),
    createRow: vi.fn(),
    updateRow: vi.fn(),
    deleteRow: vi.fn(),
  },
  storage: {
    getFile: vi.fn(),
    getFileView: vi.fn(),
    createFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}))

vi.mock("@/lib/appwrite", () => ({
  APPWRITE_DATABASE_ID: "cfarm",
  getAppwrite: () => appwrite,
}))
vi.mock("@/lib/runtime-store", () => ({
  RUNTIME_DATABASE_ID: "cfarm",
  getRuntimeStore: () => ({
    records: appwrite.tables,
    objects: appwrite.storage,
  }),
}))

import {
  createDomainAssetOnce,
  createPipelineDomainDocumentOnce,
  readPipelineDomainDocumentOnce,
  readPipelineDomainPageOnce,
} from "@/lib/pipeline-domain-storage"

describe("pipeline domain storage one-request primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appwrite.tables.listRows.mockResolvedValue({ rows: [] })
    appwrite.tables.createRow.mockResolvedValue({})
    appwrite.storage.createFile.mockResolvedValue({})
  })

  it("uses one listRows call for one fixed image-collection page", async () => {
    appwrite.tables.listRows.mockResolvedValue({
      rows: [
        {
          $id: "row-1",
          data: JSON.stringify({
            name: "Collection",
            created_at: "2026-08-01",
            images: [],
          }),
        },
      ],
    })
    const page = await readPipelineDomainPageOnce({
      domain: "image-collections",
      ownerId: "owner-1",
      limit: 50,
    })

    expect(page.records).toHaveLength(1)
    expect(appwrite.tables.listRows).toHaveBeenCalledOnce()
    expect(totalExternalCalls()).toBe(1)
  })

  it("uses one getRow call and no fallback read for a missing document", async () => {
    appwrite.tables.getRow.mockRejectedValue({ code: 404 })
    await expect(
      readPipelineDomainDocumentOnce({
        domain: "social-template-runs",
        ownerId: "owner-1",
        id: "run-1",
      })
    ).resolves.toBeNull()

    expect(appwrite.tables.getRow).toHaveBeenCalledOnce()
    expect(totalExternalCalls()).toBe(1)
  })

  it("creates one result row without a read-before-write or media write", async () => {
    const created = await createPipelineDomainDocumentOnce({
      domain: "results",
      ownerId: "owner-1",
      record: {
        id: "result-1",
        automationId: "automation-1",
        runId: "run-1",
        workflowType: "slideshow",
        title: "Result",
        status: "succeeded",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        artifacts: {
          outputImages: ["/api/local-assets/slideshows/outputs/one.png"],
        },
        destinationAccountIds: [],
      },
    })

    expect(created.media).toHaveLength(1)
    expect(appwrite.tables.createRow).toHaveBeenCalledOnce()
    expect(totalExternalCalls()).toBe(1)
  })

  it("creates one owner-scoped UGC asset with one storage request", async () => {
    await createDomainAssetOnce({
      domain: "ugc",
      ownerId: "owner-1",
      relativePath: "ugc_avatar_videos/owner-1/run-1/video.mp4",
      bytes: Buffer.from("video"),
    })

    expect(appwrite.storage.createFile).toHaveBeenCalledOnce()
    expect(totalExternalCalls()).toBe(1)
  })
})

function totalExternalCalls() {
  return [
    ...Object.values(appwrite.tables),
    ...Object.values(appwrite.storage),
  ].reduce((total, mock) => total + mock.mock.calls.length, 0)
}
