import { beforeEach, describe, expect, it, vi } from "vitest"

const services = vi.hoisted(() => ({
  approveTikTokReplyDrafts: vi.fn(),
  draftTikTokCommentReplies: vi.fn(),
  getTikTokCommentCompanionManifest: vi.fn(),
  ingestTikTokComments: vi.fn(),
  queueApprovedTikTokReplies: vi.fn(),
  recordTikTokCommentSendResults: vi.fn(),
  tiktokCommentCaptureContext: vi.fn(() => ({
    ownerId: "owner-1",
    collectionId: "collection-1",
  })),
}))

vi.mock("@/lib/system-owner-context", () => ({
  withSystemOwner: vi.fn(
    async (_ownerId: string, callback: () => Promise<unknown>) => callback()
  ),
}))
vi.mock("@/lib/tiktok-comment-replies", () => ({
  draftTikTokCommentReplies: services.draftTikTokCommentReplies,
}))
vi.mock("@/lib/tiktok-comments", () => ({
  approveTikTokReplyDrafts: services.approveTikTokReplyDrafts,
  getTikTokCommentCompanionManifest: services.getTikTokCommentCompanionManifest,
  ingestTikTokComments: services.ingestTikTokComments,
  queueApprovedTikTokReplies: services.queueApprovedTikTokReplies,
  recordTikTokCommentSendResults: services.recordTikTokCommentSendResults,
  tiktokCommentCaptureContext: services.tiktokCommentCaptureContext,
}))

import { GET, POST } from "./route"

const endpoint = "https://lumenclip.example/api/tiktok-comments/capture"

beforeEach(() => {
  vi.clearAllMocks()
  services.tiktokCommentCaptureContext.mockReturnValue({
    ownerId: "owner-1",
    collectionId: "collection-1",
  })
})

describe("TikTok comments companion route", () => {
  it("returns the token-scoped comment review manifest", async () => {
    services.getTikTokCommentCompanionManifest.mockResolvedValue({
      collection: { id: "collection-1", status: "ready" },
      comments: [{ id: "comment-1", text: "Too real" }],
      drafts: [{ id: "draft-1", text: "It really is." }],
      approvals: [],
      sends: [],
      sendResults: [],
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      collection: { id: "collection-1" },
      comments: [{ text: "Too real" }],
      drafts: [{ text: "It really is." }],
    })
    expect(services.getTikTokCommentCompanionManifest).toHaveBeenCalledWith(
      "signed-token"
    )
  })

  it("drafts, approves, and queues replies through the signed endpoint", async () => {
    services.draftTikTokCommentReplies.mockResolvedValue([{ id: "draft-1" }])
    services.approveTikTokReplyDrafts.mockResolvedValue([{ id: "approval-1" }])
    services.queueApprovedTikTokReplies.mockResolvedValue([{ id: "send-1" }])

    const draft = await POST(
      request({
        action: "draft",
        collectionId: "collection-1",
      })
    )
    const approve = await POST(
      request({
        action: "approve",
        collectionId: "collection-1",
        approvals: [
          {
            draftId: "draft-1",
            text: "Edited response",
            heart: true,
          },
        ],
      })
    )
    const send = await POST(
      request({
        action: "send",
        collectionId: "collection-1",
        draftIds: ["draft-1"],
        confirmSend: true,
      })
    )

    await expect(draft.json()).resolves.toEqual({
      drafts: [{ id: "draft-1" }],
    })
    await expect(approve.json()).resolves.toEqual({
      approvals: [{ id: "approval-1" }],
    })
    await expect(send.json()).resolves.toEqual({
      sends: [{ id: "send-1" }],
    })
    expect(services.draftTikTokCommentReplies).toHaveBeenCalledWith({
      collectionId: "collection-1",
    })
    expect(services.approveTikTokReplyDrafts).toHaveBeenCalledWith({
      collectionId: "collection-1",
      approvals: [
        {
          draftId: "draft-1",
          text: "Edited response",
          heart: true,
        },
      ],
    })
    expect(services.queueApprovedTikTokReplies).toHaveBeenCalledWith({
      collectionId: "collection-1",
      draftIds: ["draft-1"],
      confirmSend: true,
    })
  })

  it("rejects actions outside the token-scoped collection", async () => {
    const response = await POST(
      request({
        action: "draft",
        collectionId: "collection-2",
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: "Capture token does not match collection",
    })
    expect(services.draftTikTokCommentReplies).not.toHaveBeenCalled()
  })
})

function request(body?: object) {
  return new Request(endpoint, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: "Bearer signed-token",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
