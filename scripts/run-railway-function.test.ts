import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execute = promisify(execFile)
const run = (service: string, mode: string) =>
  execute(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/run-railway-function.ts",
      service,
      mode,
    ],
    {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      timeout: 10_000,
    }
  )

describe("Railway launcher in the real tsx runtime", () => {
  it("loads the worker as a callable function without a database", async () => {
    const result = await run("job-worker", "--check")
    expect(result.stdout).toContain("handler imports successfully")
  })

  it("exits after the retired scheduler's no-op", async () => {
    const result = await run("template-scheduler", "--once")
    expect(result.stdout).toContain("template scheduler disabled")
  })

  it("exits with failure when a cron cannot access its database", async () => {
    await expect(run("job-worker", "--once")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Railway PostgreSQL is not configured"),
    })
  })
})
