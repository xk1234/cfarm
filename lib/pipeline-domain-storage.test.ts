import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listDomainRecords: vi.fn(),
  getDomainRecord: vi.fn(),
  putDomainRecords: vi.fn(),
  syncOutputMedia: vi.fn(),
  putRailwayObject: vi.fn(),
  railwayObjectKey: vi.fn(
    (bucketId: string, fileId: string) => `lumenclip/${bucketId}/${fileId}`
  ),
}))

vi.mock("@/lib/railway/domain-record-store", () => ({
  listDomainRecords: mocks.listDomainRecords,
  getDomainRecord: mocks.getDomainRecord,
  putDomainRecords: mocks.putDomainRecords,
  syncOutputMedia: mocks.syncOutputMedia,
}))

vi.mock("@/lib/railway/object-storage", () => ({
  putRailwayObject: mocks.putRailwayObject,
  railwayObjectKey: mocks.railwayObjectKey,
  railwayObjectExists: vi.fn(),
  readRailwayObject: vi.fn(),
  deleteRailwayObject: vi.fn(),
}))

import {
  createDomainAssetOnce,
  createPipelineDomainDocumentOnce,
  readPipelineDomainDocumentOnce,
  readPipelineDomainPageOnce,
} from "@/lib/pipeline-domain-storage"

describe("pipeline Railway storage primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listDomainRecords.mockResolvedValue([])
    mocks.getDomainRecord.mockResolvedValue(null)
    mocks.putDomainRecords.mockResolvedValue(undefined)
    mocks.syncOutputMedia.mockResolvedValue(undefined)
    mocks.putRailwayObject.mockResolvedValue(undefined)
  })

  it("uses one domain-record query for one fixed image-collection page", async () => {
    mocks.listDomainRecords.mockResolvedValue([
      {
        rowId: "row-1",
        payload: {
          name: "Collection",
          created_at: "2026-08-01",
          images: [],
        },
      },
    ])
    const page = await readPipelineDomainPageOnce({
      domain: "image-collections",
      ownerId: "owner-1",
      limit: 50,
    })

    expect(page.records).toHaveLength(1)
    expect(mocks.listDomainRecords).toHaveBeenCalledOnce()
  })

  it("uses one lookup and no fallback read for a missing document", async () => {
    mocks.getDomainRecord.mockResolvedValue(null)
    await expect(
      readPipelineDomainDocumentOnce({
        domain: "x-runs",
        ownerId: "owner-1",
        id: "run-1",
      })
    ).resolves.toBeNull()

    expect(mocks.getDomainRecord).toHaveBeenCalledOnce()
  })

  it("persists one result row and its normalized media", async () => {
    const created = await createPipelineDomainDocumentOnce({
      domain: "results",
      ownerId: "owner-1",
      record: {
        id: "result-1",
        ownerId: "owner-1",
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
    expect(mocks.putDomainRecords).toHaveBeenCalledOnce()
    expect(mocks.syncOutputMedia).toHaveBeenCalledOnce()
  })

  it("creates one owner-scoped UGC asset with one object write", async () => {
    await createDomainAssetOnce({
      domain: "ugc",
      ownerId: "owner-1",
      relativePath: "ugc_avatar_videos/owner-1/run-1/video.mp4",
      bytes: Buffer.from("video"),
    })

    expect(mocks.putRailwayObject).toHaveBeenCalledOnce()
  })
})
