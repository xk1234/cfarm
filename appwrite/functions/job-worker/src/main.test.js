import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./slideshow-automation.js", () => ({
  runSlideshowAutomation: vi.fn(),
}))

import { findCandidates, sendConfiguredReminder } from "./main.js"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("job worker candidate queries", () => {
  it("does not query expired leases when queued work exists", async () => {
    const queued = { $id: "queued-1", status: "queued" }
    const listRows = vi.fn().mockResolvedValueOnce({ rows: [queued] })

    await expect(findCandidates({ listRows })).resolves.toEqual([queued])
    expect(listRows).toHaveBeenCalledTimes(1)
  })

  it("checks expired leases only when the queued query is empty", async () => {
    const stale = { $id: "stale-1", status: "processing" }
    const listRows = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [stale] })

    await expect(findCandidates({ listRows })).resolves.toEqual([stale])
    expect(listRows).toHaveBeenCalledTimes(2)
  })
})

describe("configured reminders", () => {
  it("suppresses a queued reminder when the workspace has reminders off", async () => {
    const tables = {
      listRows: vi.fn().mockResolvedValue({
        rows: [{ data: JSON.stringify({ channel: "none" }) }],
      }),
    }
    await expect(
      sendConfiguredReminder(
        { event: "generated", text: "Generated" },
        tables,
        { owner_id: "owner-1" }
      )
    ).resolves.toEqual({ sent: false, reason: "disabled" })
  })

  it("uses the workspace destination for an enabled event", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token")
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetcher)
    const tables = {
      listRows: vi.fn().mockResolvedValue({
        rows: [
          {
            data: JSON.stringify({
              channel: "telegram",
              telegramChatId: "123456",
              events: { generated: true },
            }),
          },
        ],
      }),
    }

    await expect(
      sendConfiguredReminder(
        { event: "generated", text: "Generated" },
        tables,
        { owner_id: "owner-1" }
      )
    ).resolves.toEqual({ sent: true })
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/sendMessage"),
      expect.objectContaining({
        body: JSON.stringify({ chat_id: "123456", text: "Generated" }),
      })
    )
  })

  it("adds a posted confirmation button only to manual ready reminders", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token")
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetcher)
    const tables = {
      listRows: vi.fn().mockResolvedValue({
        rows: [
          {
            data: JSON.stringify({
              channel: "telegram",
              telegramChatId: "123456",
              events: { ready_to_post: true },
            }),
          },
        ],
      }),
    }

    await sendConfiguredReminder(
      {
        event: "ready_to_post",
        text: "Ready to post",
        requiresPostConfirmation: true,
      },
      tables,
      { $id: "job-ready-1", owner_id: "owner-1" }
    )

    const request = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(request.reply_markup).toEqual({
      inline_keyboard: [
        [
          {
            text: "Yes, I posted it",
            callback_data: "posted:job-ready-1",
          },
        ],
      ],
    })
  })

  it("keeps automatic scheduling reminders notification-only", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token")
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetcher)
    const tables = {
      listRows: vi.fn().mockResolvedValue({
        rows: [
          {
            data: JSON.stringify({
              channel: "telegram",
              telegramChatId: "123456",
              events: { scheduled_to_post: true },
            }),
          },
        ],
      }),
    }

    await sendConfiguredReminder(
      {
        event: "scheduled_to_post",
        text: "Scheduled automatically",
      },
      tables,
      { $id: "job-scheduled-1", owner_id: "owner-1" }
    )

    const request = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(request).toEqual({
      chat_id: "123456",
      text: "Scheduled automatically",
    })
  })
})
