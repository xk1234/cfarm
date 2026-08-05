import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  analyzeLumenLabProjectScripts,
  fetchLumenLabProjectHooks,
  fetchLumenLabProjects,
  normalizeLumenLabBaseUrl,
} from "@/lib/lumenlab-hooks"

afterEach(() => {
  delete process.env.LUMENLAB_URL
  delete process.env.LUMENLAB_INTEGRATION_TOKEN
})

describe("LumenLab hook integration", () => {
  it("normalizes the configured origin and rejects embedded credentials", () => {
    expect(normalizeLumenLabBaseUrl("https://lab.example/path?q=1")).toBe(
      "https://lab.example"
    )
    expect(() =>
      normalizeLumenLabBaseUrl("https://user:secret@lab.example")
    ).toThrow("cannot contain credentials")
  })

  it("fetches projects and hooks with the server-side bearer token", async () => {
    process.env.LUMENLAB_URL = "https://lab.example"
    process.env.LUMENLAB_INTEGRATION_TOKEN = "secret-token"
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          projects: [
            { id: "p1", title: "Project One", updatedAt: "2026-08-02" },
          ],
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          project: {
            id: "p1",
            title: "Project One",
            updatedAt: "2026-08-02",
          },
          scriptCount: 1,
          projectContentDirection: "Teach with examples.",
          projectContent: "A reusable source brief.",
          hooks: [
            {
              id: "script:s1",
              text: "A script hook",
              createdAt: "2026-08-01",
              mechanisms: [],
              sourceType: "script",
              sourceId: "s1",
              contentDirection: "Build the argument.",
              content: "The source argument.",
            },
          ],
          analysis: {
            model: "test-model",
            tokensIn: 10,
            tokensOut: 10,
            costUsd: 0.01,
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          project: {
            id: "p1",
            title: "Project One",
            updatedAt: "2026-08-02",
          },
          hooks: [
            {
              id: "h1",
              text: "A saved hook",
              createdAt: "2026-08-01",
              mechanisms: ["curiosity-gap"],
            },
          ],
          total: 1,
        })
      )

    await expect(fetchLumenLabProjects(fetchImpl)).resolves.toMatchObject({
      projects: [{ id: "p1", title: "Project One" }],
    })
    await expect(
      analyzeLumenLabProjectScripts("p1", fetchImpl)
    ).resolves.toMatchObject({
      scriptCount: 1,
      hooks: [
        {
          sourceType: "script",
          contentDirection: "Build the argument.",
        },
      ],
    })
    await expect(
      fetchLumenLabProjectHooks("p1", fetchImpl)
    ).resolves.toMatchObject({
      hooks: [{ id: "h1", text: "A saved hook" }],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer secret-token",
    })
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("POST")
  })
})
