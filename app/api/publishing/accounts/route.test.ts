import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories } from "@/lib/data"
import { SOCIALBU_BASE_URL } from "@/lib/publishing/publisher"
import { createSocialBuMock } from "@/lib/publishing/testing"

import { GET as getStatus } from "../status/route"
import { DELETE, GET, POST } from "./route"

beforeEach(() => {
  resetMemoryRepositories()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function body(accountId: string) {
  return new Request("http://localhost/api/publishing/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ integrationId: accountId }),
  })
}

describe("/api/publishing/accounts", () => {
  it("reports SocialBu as not connected without a token", async () => {
    vi.stubEnv("SOCIALBU_API_TOKEN", "")
    const response = await GET(new Request("http://localhost/api/publishing/accounts"), undefined)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: { configured: false, message: "SocialBu not connected" },
      accounts: [],
      integrations: [],
    })
    const status = await getStatus(new Request("http://localhost/api/publishing/status"), undefined)
    expect(await status.json()).toEqual({ status: { configured: false, message: "SocialBu not connected" } })
  })

  it("lists SocialBu accounts and hides/restores them", async () => {
    vi.stubEnv("SOCIALBU_API_TOKEN", "test-token")
    vi.stubGlobal("fetch", createSocialBuMock({ baseUrl: SOCIALBU_BASE_URL }).fetch)

    const first = (await (await GET(new Request("http://localhost"), undefined)).json()) as {
      integrations: Array<{ integration_id: string; provider: string; disabled: boolean }>
    }
    expect(first.integrations.map((i) => [i.integration_id, i.provider, i.disabled])).toEqual([
      ["101", "tiktok", false],
      ["202", "instagram", false],
      ["303", "facebook", true],
    ])

    expect((await DELETE(body("101"), undefined)).status).toBe(200)
    const hidden = (await (await GET(new Request("http://localhost"), undefined)).json()) as {
      integrations: Array<{ integration_id: string }>
      disconnectedIntegrations: Array<{ integration_id: string }>
    }
    expect(hidden.integrations.map((i) => i.integration_id)).toEqual(["202", "303"])
    expect(hidden.disconnectedIntegrations.map((i) => i.integration_id)).toEqual(["101"])

    expect(await (await POST(body("101"), undefined)).json()).toEqual({ disabledAccountIds: [] })
  })
})
