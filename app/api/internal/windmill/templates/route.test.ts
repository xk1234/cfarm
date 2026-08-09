import { afterEach, describe, expect, it, vi } from "vitest"

const { listAutomationRecords, listXAutomations } = vi.hoisted(() => ({
  listAutomationRecords: vi.fn(),
  listXAutomations: vi.fn(),
}))

vi.mock("@/lib/automations", () => ({ listAutomationRecords }))
vi.mock("@/lib/x-automation-store", () => ({ listXAutomations }))

import { POST } from "@/app/api/internal/windmill/templates/route"

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("Windmill template picker", () => {
  it("rejects requests without the shared bearer secret", async () => {
    vi.stubEnv("WINDMILL_SHARED_SECRET", "shared-secret")
    const response = await POST(
      request({ ownerId: "owner-1", kind: "slideshow" })
    )

    expect(response.status).toBe(401)
    expect(listAutomationRecords).not.toHaveBeenCalled()
  })

  it("returns visible templates of the requested kind", async () => {
    vi.stubEnv("WINDMILL_SHARED_SECRET", "shared-secret")
    listAutomationRecords.mockResolvedValue([
      template("slide-1", "Astrology", "slideshow"),
      template("ugc-1", "Product reaction", "ugc"),
      { ...template("slide-2", "Hidden", "slideshow"), hidden: true },
    ])

    const response = await POST(
      request({ ownerId: "owner-1", kind: "slideshow" }, "Bearer shared-secret")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      options: [{ value: "slide-1", label: "Astrology" }],
    })
  })
})

function request(body: unknown, authorization?: string) {
  return new Request(
    "https://lumenclip.example/api/internal/windmill/templates",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify(body),
    }
  )
}

function template(
  id: string,
  name: string,
  automationKind: "slideshow" | "ugc"
) {
  return { id, name, hidden: false, schema: { automationKind } }
}
