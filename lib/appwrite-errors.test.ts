import { describe, expect, it } from "vitest"

import {
  isAppwriteQuotaError,
  toLumenClipDataError,
} from "@/lib/appwrite-errors"

describe("Appwrite quota errors", () => {
  it("recognizes SDK and nested response quota errors", () => {
    expect(
      isAppwriteQuotaError({
        code: 429,
        type: "general_rate_limit_exceeded",
      })
    ).toBe(true)
    expect(
      isAppwriteQuotaError({
        response: {
          code: 402,
          type: "limit_databases_reads_exceeded",
          message: "Resource limit for your project has exceeded.",
        },
      })
    ).toBe(true)
  })

  it("does not relabel ordinary not-found errors as quota failures", () => {
    expect(
      isAppwriteQuotaError({
        code: 404,
        type: "row_not_found",
        message: "Row not found",
      })
    ).toBe(false)
  })

  it("explains that quota failures are not empty or missing data", () => {
    const error = toLumenClipDataError({
      code: 429,
      type: "limit_databases_reads_exceeded",
    })
    expect(error.message).toContain("Appwrite quota")
    expect(error.message).toContain("not an empty result")
    expect(error.message).toContain(
      "does not mean the requested record is missing"
    )
  })
})
