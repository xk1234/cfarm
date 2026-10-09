import { describe, expect, it } from "vitest"

import { openApiApp } from "@/lib/openapi-app"

describe("OpenAPI foundation", () => {
  it("serves a typed health contract and generated schema", async () => {
    const health = await openApiApp.request("/api/v1/health")
    const specification = await openApiApp.request("/api/v1/openapi.json")

    await expect(health.json()).resolves.toMatchObject({ status: "ok" })
    await expect(specification.json()).resolves.toMatchObject({
      openapi: "3.1.0",
      paths: { "/api/v1/health": expect.any(Object) },
    })
  })
})
