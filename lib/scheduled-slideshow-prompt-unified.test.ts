import { describe, expect, it } from "vitest"
import { fileURLToPath } from "node:url"

import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation-payload"
import {
  buildScheduledSlideshowPrompt as appBuildScheduledSlideshowPrompt,
  getTempSlidePromptPlaceholders,
  styleRequestsLowercase as appStyleRequestsLowercase,
  type TempSlideTestingAutomation,
} from "@/lib/temp-slide-testing-shared"

const workerSharedUrl = new URL(
  "../appwrite/functions/job-worker/src/temp-slide-testing-shared.js",
  import.meta.url
).href
const workerSlideshowSrcPath = fileURLToPath(
  new URL(
    "../appwrite/functions/job-worker/src/slideshow-automation.js",
    import.meta.url
  )
)

const automation: TempSlideTestingAutomation = {
  id: "unified-prompt-automation",
  name: "Unified Prompt Automation",
  theme: "astrology",
  hooks: ["why capricorns never forget a broken promise"],
  tone: "personal, raw, hype — a best friend testifying, street-smart and affectionate",
  style: "All text in lowercase.",
  imageCollectionIds: { hook: "", content: "", cta: "" },
  slides: [
    {
      id: "hook-1",
      index: 0,
      section: "hook",
      title: "Hook",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: true,
      displayText: true,
      collectionId: "",
      textItems: [],
    },
    {
      id: "content-2",
      index: 1,
      section: "content",
      title: "Content",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: true,
      displayText: true,
      collectionId: "",
      textItems: [
        {
          id: "content-2__heading",
          itemId: "heading",
          section: "content",
          slideId: "content-2",
          label: "Heading",
          contentDirection: "a heading that develops the hook subject",
          wordLengthMin: 3,
          wordLengthMax: 8,
          textMode: "prompt",
          staticText: "",
          font: "TikTok Display Medium",
          fontSize: "12px",
          textStyle: "whiteText",
          textPosition: "center",
          textItemWidth: "80%",
          textAlign: "left",
          textAnchor: "flush",
          textVerticalAnchor: "padded",
        },
      ],
    },
  ],
}

const selectedHook = automation.hooks[0]!
const placeholders = getTempSlidePromptPlaceholders(automation)
const primitives = {
  automationName: automation.name,
  hook: selectedHook,
  tone: automation.tone,
  style: automation.style,
  placeholders,
}

describe("scheduled slideshow prompt unification", () => {
  it("builds the same system, user, and schema on the app and worker paths", async () => {
    const appBundle = appBuildScheduledSlideshowPrompt(primitives)

    // App path: slideshowTextGenerationPayload must funnel through the shared
    // builder, so its messages + schema match the bundle byte-for-byte.
    const payload = slideshowTextGenerationPayload({ automation, selectedHook })
    expect(payload.messages[0]?.content).toBe(appBundle.system)
    expect(payload.messages[1]?.content).toBe(appBundle.user)
    expect(JSON.stringify(payload.response_format.json_schema.schema)).toBe(
      JSON.stringify(appBundle.schema)
    )

    // Worker path: the synced temp-slide-testing-shared.js exports the same
    // builder (kept in sync by scripts/sync-function-shared.mjs). Feeding the
    // same primitives must yield a byte-identical bundle.
    const workerMod = (await import(workerSharedUrl)) as {
      buildScheduledSlideshowPrompt: typeof appBuildScheduledSlideshowPrompt
      styleRequestsLowercase: typeof appStyleRequestsLowercase
    }
    const workerBundle = workerMod.buildScheduledSlideshowPrompt(primitives)
    expect(workerBundle.system).toBe(appBundle.system)
    expect(workerBundle.user).toBe(appBundle.user)
    expect(JSON.stringify(workerBundle.schema)).toBe(
      JSON.stringify(appBundle.schema)
    )
  })

  it('lowercases every value when style is "All text in lowercase." on both paths', async () => {
    // The app regex (lowercase|all lowercase, non-adjacent) is the unified one.
    expect(appStyleRequestsLowercase("All text in lowercase.")).toBe(true)
    expect(appStyleRequestsLowercase("everything lowercase")).toBe(true)

    // The shared builder emits the explicit lowercase rule line.
    const appBundle = appBuildScheduledSlideshowPrompt(primitives)
    expect(appBundle.user).toContain(
      "Write EVERY value — title, caption, hashtags, and all slide text — in all lowercase"
    )

    // The worker uses the SAME shared helper (no longer its stricter adjacent-only regex).
    const workerMod = (await import(workerSharedUrl)) as {
      styleRequestsLowercase: typeof appStyleRequestsLowercase
    }
    expect(workerMod.styleRequestsLowercase("All text in lowercase.")).toBe(true)

    const workerSrc = await import("node:fs").then((fs) =>
      fs.readFileSync(workerSlideshowSrcPath, "utf8")
    )
    // The old worker-only regex (which missed "All text in lowercase.") is gone.
    expect(workerSrc).not.toMatch(/\/all\\s\+lowercase\/i\.test/)
  })
})
