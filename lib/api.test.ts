import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ApiError, providerFail, readRouteId, validate } from "@/lib/api"

describe("validate", () => {
  const schema = z.object({
    name: z.string().trim().min(1, "name is required"),
    tags: z.array(z.string()).default([]),
  })

  it("returns the parsed value (with defaults applied) on valid input", () => {
    const parsed = validate(schema, { name: "Maya" })
    expect(parsed).toEqual({ name: "Maya", tags: [] })
  })

  it("throws ApiError(400) with a field-scoped message on invalid input", () => {
    try {
      validate(schema, { name: "  " })
      throw new Error("expected validate to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
      expect((error as ApiError).message).toBe("name: name is required")
    }
  })

  it("reports a nested path in the error message", () => {
    const nested = z.object({
      settings: z.object({ duration: z.number() }),
    })
    try {
      validate(nested, { settings: { duration: "not-a-number" } })
      throw new Error("expected validate to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).message).toMatch(/^settings\.duration: /)
    }
  })
})

describe("providerFail", () => {
  it("surfaces an Error's message with the given status", async () => {
    const response = providerFail(new Error("Upstream boom"), "fallback", 502)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "Upstream boom" })
  })

  it("uses the fallback for non-Error values and defaults to 500", async () => {
    const response = providerFail("weird", "fallback message")
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "fallback message" })
  })
})

describe("readRouteId", () => {
  it("returns the trimmed id", async () => {
    expect(await readRouteId(Promise.resolve({ id: "  abc " }))).toBe("abc")
  })

  it("returns null for an empty/blank id", async () => {
    expect(await readRouteId(Promise.resolve({ id: "   " }))).toBeNull()
  })
})
