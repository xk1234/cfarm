import { describe, expect, it } from "vitest"
import { fileURLToPath } from "node:url"
import fs from "node:fs"

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

  it("gives the configured Tone and Style structural prominence", () => {
    const appBundle = appBuildScheduledSlideshowPrompt(primitives)
    // The voice block sits above metadata/placeholder lines, not buried below.
    const voiceLineIndex = appBundle.user
      .split("\n")
      .findIndex((line) => line.startsWith("Voice ("))
    const metadataIndex = appBundle.user
      .split("\n")
      .findIndex((line) => line === "Metadata requirements:")
    expect(voiceLineIndex).toBeGreaterThan(-1)
    expect(metadataIndex).toBeGreaterThan(voiceLineIndex)
    expect(appBundle.user).toContain(`Tone: ${automation.tone}`)
    expect(appBundle.user).toContain(`Style: ${automation.style}`)
    // The system prompt elevates tone above the model's literary default.
    expect(appBundle.system).toContain(
      "the configured Tone and Style govern the voice"
    )
    expect(appBundle.system).toContain(
      "Do not override a configured Tone or Style with a generic literary default"
    )
  })

  it("does not let the raw narrative template dump reach the prompt", async () => {
    const workerSrc = await import("node:fs").then((fs) =>
      fs.readFileSync(workerSlideshowSrcPath, "utf8")
    )
    // The hand-rolled "Narrative direction: ${...}" line is gone from the worker.
    expect(workerSrc).not.toContain("Narrative direction")
    // The shared builder never emits a "Narrative direction" section on its own.
    const appBundle = appBuildScheduledSlideshowPrompt(primitives)
    const workerMod = (await import(workerSharedUrl)) as {
      buildScheduledSlideshowPrompt: typeof appBuildScheduledSlideshowPrompt
    }
    const workerBundle = workerMod.buildScheduledSlideshowPrompt(primitives)
    expect(appBundle.user).not.toContain("Narrative direction")
    expect(workerBundle.user).not.toContain("Narrative direction")
    // And the builder never passes through unexpanded hook templates.
    expect(appBundle.user).not.toContain("[[ZODIAC]]")
    expect(workerBundle.user).not.toContain("[[ZODIAC]]")
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

  it("word-limit violations are surfaced by the shared validator used by both paths", async () => {
    // The shared helper drives both the app generation retry loop and the
    // worker validateScheduledSlideshowText, so over-range text is rejected
    // (and repaired) instead of silently shipped. The app retry is proven in
    // lib/slideshow-text-generation.test.ts; here we assert the shared rule.
    const placeholder = placeholders[0]!
    expect(
      appBuildScheduledSlideshowPrompt(primitives).schema.properties.text
        .properties[placeholder.id]
    ).toBeTruthy()

    // 11 words vs a max of 8 → violation message is emitted.
    const { placeholderWordRangeError } = await import(workerSharedUrl) as {
      placeholderWordRangeError: (
        placeholder: { id: string; wordLengthMin: number; wordLengthMax: number },
        text: string
      ) => string | null
    }
    const overRange =
      "geminis stay curious because change gives them room to keep growing"
    expect(placeholderWordRangeError(placeholder, overRange)).toContain(
      "has 11 words, but its configured maximum is 8"
    )
    const inRange = "change keeps geminis curious"
    expect(placeholderWordRangeError(placeholder, inRange)).toBeNull()

    // The worker wires this validator into its repair loop.
    const workerSrc = await import("node:fs").then((fs) =>
      fs.readFileSync(workerSlideshowSrcPath, "utf8")
    )
    expect(workerSrc).toContain("placeholderWordRangeError")
  })
})