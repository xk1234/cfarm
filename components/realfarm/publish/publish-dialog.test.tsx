import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  PUBLISHER_NOT_CONNECTED_MESSAGE,
  type PublisherAccount,
} from "@/lib/publishing/publisher"

import {
  PublishDialogContent,
  buildPublishInput,
  tiktokPrivacyOptions,
  type PublishFormState,
} from "./publish-dialog"

const render = {
  id: "rnd_1",
  title: "Sleep habits",
  slides: [
    { index: 0, id: "hook", url: "/api/files/rnd_1-00", width: 1080, height: 1920 },
    { index: 1, id: "item-1", url: "/api/files/rnd_1-01", width: 1080, height: 1920 },
  ],
}

const accounts: PublisherAccount[] = [
  {
    id: "11",
    provider: "tiktok",
    name: "@sleepy",
    active: true,
    avatarUrl: null,
    extra: { creator_info: { privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] } },
  },
  { id: "12", provider: "instagram", name: "sleepy.ig", active: true, avatarUrl: null, extra: {} },
  { id: "13", provider: "facebook", name: "Old page", active: false, avatarUrl: null, extra: {} },
]

const form: PublishFormState = {
  accountIds: ["11", "12"],
  caption: "Night routine",
  timing: "now",
  publishAtLocal: "",
  tiktokPrivacy: "SELF_ONLY",
  tiktokAutoMusic: true,
}

describe("PublishDialogContent", () => {
  it("shows the SocialBu not connected state instead of the form", () => {
    const html = renderToStaticMarkup(
      <PublishDialogContent
        render={render}
        status={{ configured: false, message: PUBLISHER_NOT_CONNECTED_MESSAGE }}
        accounts={null}
        onSubmit={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )
    expect(html).toContain("SocialBu not connected")
    expect(html).toContain("Open settings")
    expect(html).not.toContain("Accounts")
    expect(html).not.toContain(">Publish<")
  })

  it("lists only active SocialBu accounts when connected", () => {
    const html = renderToStaticMarkup(
      <PublishDialogContent
        render={render}
        status={{ configured: true, provider: "socialbu" }}
        accounts={accounts}
        onSubmit={vi.fn()}
      />
    )
    expect(html).toContain("@sleepy")
    expect(html).toContain("sleepy.ig")
    expect(html).not.toContain("Old page")
    expect(html).toContain("Sleep habits · 2 slides")
    expect(html).toContain(">Publish<")
  })

  it("shows a loading state while the status is unknown", () => {
    const html = renderToStaticMarkup(
      <PublishDialogContent render={render} status={null} accounts={null} onSubmit={vi.fn()} />
    )
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain("SocialBu not connected")
  })
})

describe("buildPublishInput", () => {
  it("requires at least one account", () => {
    expect(buildPublishInput("rnd_1", { ...form, accountIds: [] }, accounts)).toEqual({
      ok: false,
      error: "Choose at least one account.",
    })
  })

  it("publishes now with TikTok options only when a TikTok account is selected", () => {
    const built = buildPublishInput("rnd_1", form, accounts)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.input).toMatchObject({
      renderId: "rnd_1",
      accountIds: ["11", "12"],
      caption: "Night routine",
      publishAt: null,
      platformOptions: { tiktok: { privacy_status: "SELF_ONLY", auto_add_music: true } },
    })
    const igOnly = buildPublishInput("rnd_1", { ...form, accountIds: ["12"] }, accounts)
    expect(igOnly.ok && igOnly.input.platformOptions).toEqual({})
  })

  it("schedules in the future and rejects past times", () => {
    const now = new Date("2026-10-09T10:00:00Z")
    const past = buildPublishInput(
      "rnd_1",
      { ...form, timing: "schedule", publishAtLocal: "2026-10-09T09:00" },
      accounts,
      now
    )
    expect(past.ok).toBe(false)
    const future = buildPublishInput(
      "rnd_1",
      { ...form, timing: "schedule", publishAtLocal: "2026-10-12T09:30" },
      accounts,
      now
    )
    expect(future.ok).toBe(true)
    if (!future.ok) return
    expect(future.input.publishAt).toBe(new Date("2026-10-12T09:30").toISOString())
    expect(future.input.intentKey).toContain("rnd_1:11,12:")
  })

  it("reads TikTok privacy options from the account's creator info", () => {
    expect(tiktokPrivacyOptions(accounts)).toEqual(["SELF_ONLY", "PUBLIC_TO_EVERYONE"])
    expect(tiktokPrivacyOptions([])).toContain("PUBLIC_TO_EVERYONE")
  })
})
