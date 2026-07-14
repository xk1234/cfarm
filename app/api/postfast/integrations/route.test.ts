import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
  postfastRequest: vi.fn(),
  listAutomationRecords: vi.fn(),
  patchAutomationRecord: vi.fn(),
  listXAutomations: vi.fn(),
  upsertXAutomation: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getUserPreferences: mocks.getUserPreferences,
  updateUserPreferences: mocks.updateUserPreferences,
}))
vi.mock("@/lib/postfast-client", () => ({
  postfastRequest: mocks.postfastRequest,
}))
vi.mock("@/lib/automations", () => ({
  listAutomationRecords: mocks.listAutomationRecords,
  patchAutomationRecord: mocks.patchAutomationRecord,
}))
vi.mock("@/lib/x-automation-store", () => ({
  listXAutomations: mocks.listXAutomations,
  upsertXAutomation: mocks.upsertXAutomation,
}))

import { DELETE, GET, POST } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
  mocks.getUserPreferences.mockResolvedValue({
    postfastDisconnectedIntegrationIds: ["account-hidden"],
  })
  mocks.updateUserPreferences.mockResolvedValue({})
  mocks.postfastRequest.mockResolvedValue([
    { id: "account-visible", platform: "TIKTOK" },
    { id: "account-hidden", platform: "INSTAGRAM" },
  ])
  mocks.listAutomationRecords.mockResolvedValue([])
  mocks.listXAutomations.mockResolvedValue([])
})

describe("PostFast integration visibility", () => {
  it("returns connected and locally disconnected accounts separately", async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.integrations).toEqual([
      { id: "account-visible", platform: "TIKTOK" },
    ])
    expect(payload.disconnectedIntegrations).toEqual([
      { id: "account-hidden", platform: "INSTAGRAM" },
    ])
  })

  it("disconnects an account and removes it from every automation type", async () => {
    mocks.listAutomationRecords.mockResolvedValue([
      {
        id: "automation-1",
        schema: {
          social_integrations: [
            { integration_id: "account-visible" },
            { integration_id: "account-other" },
          ],
        },
      },
    ])
    mocks.listXAutomations.mockResolvedValue([
      {
        id: "x-automation-1",
        updatedAt: "old",
        publishing: {
          autoPost: true,
          integrations: [{ integration_id: "account-visible" }],
        },
      },
    ])

    const response = await DELETE(
      new Request("http://localhost/api/postfast/integrations", {
        method: "DELETE",
        body: JSON.stringify({ integrationId: "account-visible" }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      disconnected: true,
      integrationId: "account-visible",
      removedFromAutomations: 2,
    })
    expect(mocks.updateUserPreferences).toHaveBeenCalledWith("user-1", {
      postfastDisconnectedIntegrationIds: ["account-hidden", "account-visible"],
    })
    expect(mocks.patchAutomationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "automation-1",
        schema: expect.objectContaining({
          social_integrations: [{ integration_id: "account-other" }],
        }),
      })
    )
    expect(mocks.upsertXAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "x-automation-1",
        publishing: {
          autoPost: true,
          integrations: [],
        },
      })
    )
  })

  it("restores a disconnected account", async () => {
    const response = await POST(
      new Request("http://localhost/api/postfast/integrations", {
        method: "POST",
        body: JSON.stringify({ integrationId: "account-hidden" }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.updateUserPreferences).toHaveBeenCalledWith("user-1", {
      postfastDisconnectedIntegrationIds: [],
    })
  })
})
