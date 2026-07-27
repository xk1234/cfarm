import { describe, expect, it, vi } from "vitest"
import { fileURLToPath } from "node:url"

import {
  generateSlideshowText as appGenerateSlideshowText,
  selectSlideshowImages as appSelectSlideshowImages,
} from "@/lib/slideshow-generation-engine"
import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation-payload"
import {
  buildScheduledSlideshowPrompt as appBuildScheduledSlideshowPrompt,
  getTempSlidePromptPlaceholders,
  toneRequestsLowercase as appToneRequestsLowercase,
  type TempSlideTestingAutomation,
} from "@/lib/temp-slide-testing-shared"
import { buildScheduledSlideshowPrompt as testingBuildScheduledSlideshowPrompt } from "@/lib/temp-slide-testing"

const workerSharedUrl = new URL(
  "../appwrite/functions/job-worker/src/temp-slide-testing-shared.js",
  import.meta.url
).href
const workerEngineUrl = new URL(
  "../appwrite/functions/job-worker/src/slideshow-generation-engine.js",
  import.meta.url
).href
const workerSlideshowSrcPath = fileURLToPath(
  new URL(
    "../appwrite/functions/job-worker/src/slideshow-automation.js",
    import.meta.url
  )
)
const testingRouteSrcPath = fileURLToPath(
  new URL("../app/api/temp/testing-center/generate/route.ts", import.meta.url)
)

const automation: TempSlideTestingAutomation = {
  id: "unified-prompt-automation",
  name: "Unified Prompt Automation",
  theme: "astrology",
  hooks: ["why capricorns never forget a broken promise"],
  tone: "personal, raw, hype, and all lowercase — a best friend testifying, street-smart and affectionate",
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
  placeholders,
}

function completion(output: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          native_finish_reason: "stop",
          message: { content: JSON.stringify(output) },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

const onTopicOutput = {
  title: "capricorns remember",
  caption: "broken promises stay with capricorns.",
  hashtags: "#capricorn #astrology #trust",
  text: {
    "content-2__heading": "capricorns remember broken promises",
  },
}

const offTopicOutput = {
  title: "sports car guide",
  caption: "bright cars can lose value quickly.",
  hashtags: "#cars #driving #money",
  text: {
    "content-2__heading": "sports cars depreciate quickly",
  },
}

describe("scheduled slideshow prompt unification", () => {
  it("builds the same system, user, and schema on the app and worker paths", async () => {
    const appBundle = appBuildScheduledSlideshowPrompt(primitives)
    expect(appBundle.user).not.toContain("\nStyle:")

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
      toneRequestsLowercase: typeof appToneRequestsLowercase
    }
    const workerBundle = workerMod.buildScheduledSlideshowPrompt(primitives)
    expect(workerBundle.system).toBe(appBundle.system)
    expect(workerBundle.user).toBe(appBundle.user)
    expect(JSON.stringify(workerBundle.schema)).toBe(
      JSON.stringify(appBundle.schema)
    )

    // Testing-center imports the app-only adapter, whose prompt API is now a
    // re-export of the same shared source rather than a private copy.
    expect(testingBuildScheduledSlideshowPrompt(primitives)).toEqual(appBundle)
  })

  it('lowercases every value when tone requests "all lowercase" on both paths', async () => {
    expect(appToneRequestsLowercase("All text in lowercase.")).toBe(true)
    expect(appToneRequestsLowercase("everything lowercase")).toBe(true)

    // The shared builder emits the explicit lowercase rule line.
    const appBundle = appBuildScheduledSlideshowPrompt(primitives)
    expect(appBundle.user).toContain(
      "Write EVERY value — title, caption, hashtags, and all slide text — in all lowercase"
    )

    // The worker uses the SAME shared helper (no longer its stricter adjacent-only regex).
    const workerMod = (await import(workerSharedUrl)) as {
      toneRequestsLowercase: typeof appToneRequestsLowercase
    }
    expect(workerMod.toneRequestsLowercase("All text in lowercase.")).toBe(true)

    const workerSrc = await import("node:fs").then((fs) =>
      fs.readFileSync(workerSlideshowSrcPath, "utf8")
    )
    // The old worker-only regex (which missed "All text in lowercase.") is gone.
    expect(workerSrc).not.toMatch(/\/all\\s\+lowercase\/i\.test/)
  })

  it("runs byte-identical prompt construction in the app and generated worker engines", async () => {
    const workerMod = (await import(workerEngineUrl)) as {
      generateSlideshowText: typeof appGenerateSlideshowText
    }
    const appFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => completion(onTopicOutput))
    const workerFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => completion(onTopicOutput))

    const [appResult, workerResult] = await Promise.all([
      appGenerateSlideshowText({
        automation,
        selectedHook,
        apiKey: "test-key",
        fetchImpl: appFetch,
      }),
      workerMod.generateSlideshowText({
        automation,
        selectedHook,
        apiKey: "test-key",
        fetchImpl: workerFetch,
      }),
    ])

    expect(appResult.result).toEqual(workerResult.result)
    expect(JSON.parse(String(appFetch.mock.calls[0]?.[1]?.body))).toEqual(
      JSON.parse(String(workerFetch.mock.calls[0]?.[1]?.body))
    )
  })

  it("honours pinned first-slide and CTA images through both unified engines", async () => {
    const workerMod = (await import(workerEngineUrl)) as {
      selectSlideshowImages: typeof appSelectSlideshowImages
    }
    const specs = [
      { ...automation.slides[0]!, collectionId: "shared-collection" },
      {
        ...automation.slides[1]!,
        id: "cta-2",
        section: "cta" as const,
        title: "CTA",
        collectionId: "shared-collection",
      },
    ]
    const images = [
      {
        id: "decoy",
        key: "decoy",
        imageUrl: "https://example.com/decoy.jpg",
        imageCaption: "General collection image",
      },
      {
        id: "pinned-hook",
        key: "pinned-hook",
        imageUrl: "https://example.com/hook.jpg",
        imageCaption: "Pinned hook image",
      },
      {
        id: "pinned-cta",
        key: "pinned-cta",
        imageUrl: "https://example.com/cta.jpg",
        imageCaption: "Pinned CTA image",
      },
    ]
    const input = {
      hook: selectedHook,
      fallbackTitle: automation.name,
      specs,
      generatedText: onTopicOutput,
      firstSlidePinnedImageId: "pinned-hook",
      ctaPinnedImageId: "https://example.com/cta.jpg",
      candidatesForSpec: () => images,
      random: () => 0,
    }

    await expect(appSelectSlideshowImages(input)).resolves.toMatchObject([
      { id: "pinned-hook" },
      { id: "pinned-cta" },
    ])
    await expect(workerMod.selectSlideshowImages(input)).resolves.toMatchObject(
      [{ id: "pinned-hook" }, { id: "pinned-cta" }]
    )
  })

  it("flags copy that misses the hook subject on both app and worker paths", async () => {
    const workerMod = (await import(workerEngineUrl)) as {
      generateSlideshowText: typeof appGenerateSlideshowText
    }
    const appFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => completion(offTopicOutput))
    const workerFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => completion(offTopicOutput))

    const appGeneration = appGenerateSlideshowText({
      automation,
      selectedHook,
      apiKey: "test-key",
      fetchImpl: appFetch,
    })
    const workerGeneration = workerMod.generateSlideshowText({
      automation,
      selectedHook,
      apiKey: "test-key",
      fetchImpl: workerFetch,
    })

    // Both paths retry once for copy that echoes the hook, then keep the
    // generation and report the concern. Throwing it away punished good copy
    // that develops a hook without repeating its nouns, which the lexical
    // check cannot tell apart from real drift — and left the automation with
    // nothing to post at all.
    const [app, worker] = await Promise.all([appGeneration, workerGeneration])
    expect((app.violations ?? []).join(" ")).toContain(
      "does not develop the selected hook subject"
    )
    expect((worker.violations ?? []).join(" ")).toContain(
      "does not develop the selected hook subject"
    )
    expect(appFetch).toHaveBeenCalledTimes(2)
    expect(workerFetch).toHaveBeenCalledTimes(2)
  })

  it("keeps the worker and testing facility as engine callers, not generation forks", async () => {
    const fs = await import("node:fs")
    const workerSrc = fs.readFileSync(workerSlideshowSrcPath, "utf8")
    const testingRouteSrc = fs.readFileSync(testingRouteSrcPath, "utf8")

    expect(workerSrc).toContain('from "./slideshow-generation-engine.js"')
    expect(workerSrc).not.toMatch(
      /function (?:generateText|validateScheduledSlideshowText|selectHook|selectImages)\b/
    )
    expect(testingRouteSrc).toContain("previewAutomationRunPlan")
    expect(testingRouteSrc).not.toMatch(
      /function (?:generateText|validateSlideshowText|selectHook|selectImages)\b/
    )
  })
})
