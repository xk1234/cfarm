import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  automationAccountStatusItems,
  automationAccountSummary,
  automationRunPreviewImages,
  automationRunPreviewRuns,
  automationRunPreviewSlots,
} from "@/components/realfarm/automations-view"

describe("automation grid previews", () => {
  it("does not repeat generic content labels or draft counts on X cards", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/realfarm/automations-view.tsx"),
      "utf8"
    )

    expect(source).not.toContain("Content automation")
    expect(source).not.toContain("{recentRuns?.length ?? 0} drafts")
  })

  it("uses one first-slide image from each recent slideshow run", () => {
    const images = automationRunPreviewImages(
      [
        {
          id: "older",
          automationId: "automation-1",
          createdAt: "2026-07-03T10:00:00.000Z",
          plan: {
            slides: [
              { imageUrl: "/older-first.jpg" },
              { imageUrl: "/older-second.jpg" },
            ],
          },
        },
        {
          id: "newer",
          automationId: "automation-1",
          createdAt: "2026-07-04T10:00:00.000Z",
          plan: {
            slides: [
              { imageUrl: "/newer-first.jpg" },
              { imageUrl: "/newer-second.jpg" },
            ],
          },
        },
      ],
      3
    )

    expect(images).toEqual(["/newer-first.jpg", "/older-first.jpg"])
  })

  it("leaves empty preview slots when only one slideshow has been generated", () => {
    const slots = automationRunPreviewSlots(
      [
        {
          id: "single-run",
          automationId: "automation-1",
          createdAt: "2026-07-04T10:00:00.000Z",
          plan: {
            slides: [
              { imageUrl: "/single-first.jpg" },
              { imageUrl: "/single-second.jpg" },
              { imageUrl: "/single-third.jpg" },
            ],
          },
        },
      ],
      3
    )

    expect(slots).toEqual(["/single-first.jpg", null, null])
    expect(slots.filter(Boolean)).toEqual(["/single-first.jpg"])
  })

  it("returns an empty state for every preview slot without recent generated images", () => {
    expect(automationRunPreviewSlots(undefined, 3)).toEqual([null, null, null])
    expect(
      automationRunPreviewSlots(
        [
          {
            id: "empty-run",
            automationId: "automation-1",
            createdAt: "2026-07-04T10:00:00.000Z",
            plan: { slides: [] },
          },
        ],
        3
      )
    ).toEqual([null, null, null])
  })

  it("keeps a failed generation in the automation preview slots", () => {
    expect(
      automationRunPreviewRuns(
        [
          {
            id: "failed-run",
            automationId: "automation-1",
            createdAt: "2026-07-05T10:00:00.000Z",
            status: "failed",
            error: "Rendering service unavailable",
          },
          {
            id: "successful-run",
            automationId: "automation-1",
            createdAt: "2026-07-04T10:00:00.000Z",
            renderedSlides: [{ imageUrl: "/successful.jpg" }],
          },
        ],
        3
      ).map((run) => run?.id ?? null)
    ).toEqual(["failed-run", "successful-run", null])
  })

  it("uses rendered or snake_case slide image fields when plan imageUrl is absent", () => {
    expect(
      automationRunPreviewImages(
        [
          {
            id: "rendered-run",
            automationId: "automation-1",
            createdAt: "2026-07-04T10:00:00.000Z",
            renderedSlides: [{ image_url: "/rendered-snake.jpg" }],
          },
          {
            id: "source-run",
            automationId: "automation-1",
            createdAt: "2026-07-03T10:00:00.000Z",
            plan: { slides: [{ source_image_url: "/source-snake.jpg" }] },
          },
        ],
        3
      )
    ).toEqual(["/rendered-snake.jpg", "/source-snake.jpg"])
  })

  it("prefers exported thumbnails and rendered output over source plan images", () => {
    expect(
      automationRunPreviewImages(
        [
          {
            id: "video-run",
            automationId: "automation-1",
            createdAt: "2026-07-04T10:00:00.000Z",
            thumbnailUrl: "/exports/slideshow-thumbnail.png",
            renderedSlides: [{ imageUrl: "/exports/slide-001.png" }],
            plan: { slides: [{ imageUrl: "/source.jpg" }] },
          },
          {
            id: "rendered-run",
            automationId: "automation-1",
            createdAt: "2026-07-03T10:00:00.000Z",
            renderedSlides: [{ imageUrl: "/exports/rendered.png" }],
            plan: { slides: [{ imageUrl: "/source-older.jpg" }] },
          },
        ],
        3
      )
    ).toEqual(["/exports/slideshow-thumbnail.png", "/exports/rendered.png"])
  })

  it("uses one preview slot for an in-progress generation", () => {
    expect(
      automationRunPreviewSlots(
        [
          {
            id: "generation-placeholder",
            automationId: "automation-1",
            createdAt: "2026-07-04T10:00:00.000Z",
            status: "generating",
            renderedSlides: [
              { imageUrl: "/soccer-hook.jpg" },
              { imageUrl: "/soccer-body-1.jpg" },
              { imageUrl: "/soccer-body-2.jpg" },
            ],
          },
        ],
        3
      )
    ).toEqual(["/soccer-hook.jpg", null, null])
  })

  it("keeps older generations in remaining slots while a new run is in progress", () => {
    expect(
      automationRunPreviewSlots(
        [
          {
            id: "generation-placeholder",
            automationId: "automation-1",
            createdAt: "2026-07-04T10:00:00.000Z",
            status: "generating",
            renderedSlides: [
              { imageUrl: "/study-hook.jpg" },
              { imageUrl: "/study-body-1.jpg" },
            ],
          },
          {
            id: "older-run",
            automationId: "automation-1",
            createdAt: "2026-07-03T10:00:00.000Z",
            renderedSlides: [{ imageUrl: "/older-study-hook.jpg" }],
          },
        ],
        3
      )
    ).toEqual(["/study-hook.jpg", "/older-study-hook.jpg", null])
  })

  it("shows normalized automation account details even without integration records", () => {
    expect(
      automationAccountSummary({
        id: "automation-1",
        name: "Workout",
        status: "live",
        account: "YXK",
        handle: "YouTube · @YXK",
        times: ["11:00 AM"],
        favorite: false,
        theme: "ugc",
        socialIntegrations: [],
      })
    ).toEqual({
      account: "YXK",
      handle: "YouTube · @YXK",
      hasAccount: true,
    })
  })

  it("maps all selected social accounts into icon status items", () => {
    expect(
      automationAccountStatusItems({
        id: "automation-1",
        name: "Workout",
        status: "live",
        account: "YXK",
        handle: "YouTube · @YXK",
        times: ["11:00 AM"],
        favorite: false,
        theme: "ugc",
        socialIntegrations: [
          {
            provider: "youtube",
            integration_id: "youtube-1",
            name: "Main YouTube",
            profile: "@yxk",
          },
          {
            provider: "instagram",
            integration_id: "instagram-1",
            name: "IG",
            disabled: true,
          },
        ],
      })
    ).toEqual([
      {
        provider: "youtube",
        integrationId: "youtube-1",
        name: "Main YouTube",
        profile: "@yxk",
        status: "connected",
      },
      {
        provider: "instagram",
        integrationId: "instagram-1",
        name: "IG",
        profile: undefined,
        status: "disabled",
      },
    ])
  })
})
