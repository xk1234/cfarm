import { describe, expect, it, vi } from "vitest"

import type { JobRepository, StoredJob } from "@/lib/railway/job-repository"
import { createJobWorker, sendConfiguredReminder } from "@/services/job-worker"

function storedJob(patch: Partial<StoredJob> = {}): StoredJob {
  return {
    id: "job-1",
    ownerId: "owner-1",
    type: "echo",
    status: "processing",
    payload: { hello: "world" },
    result: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    priority: 0,
    runAt: "2026-08-12T00:00:00.000Z",
    lockedBy: "worker-1",
    leaseExpiresAt: "2026-08-12T00:15:00.000Z",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    completedAt: null,
    ...patch,
  }
}

function repository(claimed: StoredJob[]) {
  return {
    enqueue: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    stats: vi.fn(),
    claim: vi.fn().mockResolvedValue(claimed),
    complete: vi.fn(),
    retry: vi.fn(),
    dead: vi.fn(),
  } satisfies JobRepository
}

describe("Railway job worker", () => {
  it("claims and completes jobs through the native repository", async () => {
    const jobs = repository([storedJob()])
    const worker = createJobWorker({
      jobs,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    })

    await expect(
      worker({ log: vi.fn(), error: vi.fn() })
    ).resolves.toMatchObject({ ok: true, processed: 1, failed: 0 })
    expect(jobs.claim).toHaveBeenCalledWith(
      expect.objectContaining({ excludedTypes: ["sync-post-analytics"] })
    )
    expect(jobs.complete).toHaveBeenCalledWith("job-1", {
      echoed: { hello: "world" },
    })
  })

  it("returns retryable failures to the queue with exponential backoff", async () => {
    const jobs = repository([storedJob({ type: "unknown", attempts: 1 })])
    const worker = createJobWorker({
      jobs,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    })

    await worker({ log: vi.fn(), error: vi.fn() })

    expect(jobs.retry).toHaveBeenCalledWith({
      id: "job-1",
      error: 'no handler for job type "unknown"',
      runAt: new Date("2026-08-12T00:00:02.000Z"),
    })
    expect(jobs.dead).not.toHaveBeenCalled()
  })

  it("dead-letters a job after its final attempt", async () => {
    const jobs = repository([
      storedJob({ type: "unknown", attempts: 3, maxAttempts: 3 }),
    ])
    const worker = createJobWorker({ jobs, fetch: vi.fn() })

    await worker({ log: vi.fn(), error: vi.fn() })

    expect(jobs.dead).toHaveBeenCalledWith({
      id: "job-1",
      error: 'no handler for job type "unknown"',
    })
    expect(jobs.retry).not.toHaveBeenCalled()
  })
})

describe("configured reminders", () => {
  it("uses saved Telegram settings and public slideshow actions", async () => {
    vi.stubEnv("BASE_URL", "https://lumenclip.example")
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "share-secret")
    const fetcher = vi.fn().mockResolvedValue({ ok: true })

    await expect(
      sendConfiguredReminder(
        {
          event: "generated",
          text: "Generated",
          sourceType: "slideshow",
          sourceId: "slideshow-1",
        },
        storedJob(),
        {
          fetcher,
          loadSettings: async () => ({
            channel: "telegram",
            telegramBotToken: "123456:saved-token-abcdefghijklmnop",
            telegramChatId: "123456",
            events: { generated: true },
          }),
        }
      )
    ).resolves.toEqual({ sent: true })

    const request = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(request.reply_markup.inline_keyboard).toHaveLength(2)
    expect(request.reply_markup.inline_keyboard[0][0].url).toMatch(
      /^https:\/\/lumenclip\.example\/share\/slideshows\/slideshow-1\?token=/
    )
  })
})
