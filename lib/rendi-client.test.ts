import { describe, expect, it } from "vitest"

import { rendiJson } from "@/lib/rendi-client"

describe("Rendi HTTP client", () => {
  it("preserves provider status and response details on failure", async () => {
    await expect(
      rendiJson({
        apiKey: "rendi-test-key",
        path: "/v1/run-ffmpeg-command",
        method: "POST",
        body: { ffmpeg_command: "invalid" },
        fetchImpl: async () =>
          Response.json(
            {
              detail: [
                { msg: "Input file alias is missing" },
                { msg: "Output file is invalid" },
              ],
              request_id: "rendi-request-9",
            },
            { status: 422 }
          ),
      })
    ).rejects.toMatchObject({
      name: "RendiApiError",
      status: 422,
      message: "Input file alias is missing; Output file is invalid",
      details: {
        request_id: "rendi-request-9",
      },
    })
  })
})
