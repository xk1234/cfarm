import { describe, expect, it } from "vitest"

import {
  captureProviderRequests,
  providerRequestsFromError,
  recordProviderRequest,
} from "@/lib/provider-request-trace"

describe("provider request tracing", () => {
  it("captures nested requests for both the child and parent boundary", async () => {
    const parent = await captureProviderRequests(async () => {
      recordProviderRequest({
        provider: "OpenRouter",
        operation: "first",
        request: { messages: ["one"] },
      })
      const child = await captureProviderRequests(async () => {
        recordProviderRequest({
          provider: "OpenRouter",
          operation: "second",
          request: { messages: ["two"] },
        })
        return "child"
      })
      expect(
        child.providerRequests.map((request) => request.operation)
      ).toEqual(["second"])
      return "parent"
    })

    expect(parent.result).toBe("parent")
    expect(parent.providerRequests.map((request) => request.operation)).toEqual(
      ["first", "second"]
    )
  })

  it("retains the exact request when the provider stage fails", async () => {
    const failure = await captureProviderRequests(async () => {
      recordProviderRequest({
        provider: "OpenRouter",
        operation: "chat.completions",
        model: "openai/test",
        request: { messages: [{ role: "user", content: "failing prompt" }] },
      })
      throw new Error("provider failed")
    }).catch((error: unknown) => error)

    expect(providerRequestsFromError(failure)).toEqual([
      expect.objectContaining({
        model: "openai/test",
        request: {
          messages: [{ role: "user", content: "failing prompt" }],
        },
      }),
    ])
  })
})
