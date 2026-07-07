import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { DateTime } from "luxon"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createLocalAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import { runDueAutomations } from "@/lib/automation-runner"

let rootDir: string
let automationRootDir: string
let runRootDir: string
let imageCollectionDbPath: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-automation-runner-"))
  automationRootDir = path.join(rootDir, "automations")
  runRootDir = path.join(rootDir, "automation-runs")
  imageCollectionDbPath = path.join(rootDir, "image-collections.json")
  await mkdir(automationRootDir, { recursive: true })
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await rm(rootDir, { recursive: true, force: true })
})

describe("runDueAutomations", () => {
  it("creates one durable run for a due live automation without creating a fake scheduled social post", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/daily-scene.jpg",
        caption: "Daily scene",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    const runs = JSON.parse(
      await readFile(path.join(runRootDir, "runs.json"), "utf8")
    )
    const results = JSON.parse(
      await readFile(path.join(rootDir, "results", "results.json"), "utf8")
    )

    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({
      automationId: automation.id,
      automationTitle: "Daily hooks",
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "succeeded",
    })
    expect(result.results[0]).toMatchObject({
      automationId: automation.id,
      runId: result.created[0].id,
      workflowType: "slideshow",
      artifacts: {
        slideshowId: result.created[0].slideshowId,
      },
    })
    expect(result.skipped).toEqual([])
    expect(runs.runs).toHaveLength(1)
    expect(result.created[0].postfastRecordId).toBeUndefined()
    expect(results.results).toHaveLength(1)
    expect(results.results[0].artifacts.slideshowId).toBe(
      result.created[0].slideshowId
    )
  })

  it("builds local slideshow slides from configured image collections with top text", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                { ...section.textItems[0], contentDirection: "top hook text" },
              ],
            }
          : section.id === "body"
            ? {
                ...section,
                slideCount: 2,
              }
            : section.id === "cta"
              ? {
                  ...section,
                  slideCount: 0,
                  ctaLocation: "last",
                }
              : section
    )
    automation.schema.prompt_formatting.num_of_slides = 3
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-brand-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-brand-scenes-2026-07-03t00-00-00-000z",
      cta_slide: {
        check: true,
        cta_collection_check: true,
        cta_collection_id: "collection-brand-scenes-2026-07-03t00-00-00-000z",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Brand scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link: "/api/local-assets/image-collections/files/a.jpg",
                  caption: "Scene A",
                },
                {
                  image_link: "/api/local-assets/image-collections/files/b.jpg",
                  caption: "Scene B",
                },
                {
                  image_link: "/api/local-assets/image-collections/files/c.jpg",
                  caption: "Scene C",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/a.jpg",
        imageCaption: "Scene A",
        text: "top hook text",
        textPlacement: "top",
      }),
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/b.jpg",
        imageCaption: "Scene B",
        textPlacement: "top",
      }),
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/c.jpg",
        imageCaption: "Scene C",
        textPlacement: "top",
      }),
      expect.objectContaining({
        role: "cta",
        imageUrl: "/api/local-assets/image-collections/files/a.jpg",
        text: "Daily hooks",
      }),
    ])
  })

  it("fills main-app slideshow text with the same structured OpenRouter generation used by the testing center", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Generated Study Tips",
                    caption: "Try these study habits before your next exam.",
                    hashtags: "#studytips #learning #productivity",
                    text: {
                      "content-2__text-0": "generated body text",
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
    )
    vi.stubGlobal("fetch", fetchMock)
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  id: "hook-0",
                  contentDirection: "fixed hook",
                },
              ],
            }
          : section.id === "body"
            ? {
                ...section,
                slideCount: 1,
                textItems: [
                  {
                    ...section.textItems[0],
                    id: "text-0",
                    contentDirection: "body text prompt",
                  },
                ],
              }
            : section.id === "cta"
              ? {
                  ...section,
                  slideCount: 0,
                }
              : section
    )
    automation.schema.prompt_formatting.num_of_slides = 2
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-brand-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-brand-scenes-2026-07-03t00-00-00-000z",
      cta_slide: {
        check: false,
        cta_collection_check: false,
        cta_collection_id: "",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Brand scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link: "/api/local-assets/image-collections/files/a.jpg",
                  caption: "Scene A",
                },
                {
                  image_link: "/api/local-assets/image-collections/files/b.jpg",
                  caption: "Scene B",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const request = JSON.parse(requestInit.body as string)
    expect(request.model).toBe("google/gemini-3.1-flash-lite")
    expect(request.response_format.json_schema.name).toBe(
      "temp_slide_testing_text"
    )
    expect(request.response_format.json_schema.schema.required).toEqual([
      "title",
      "caption",
      "hashtags",
      "text",
    ])
    expect(request.messages[1].content).toContain("body text prompt")
    expect(request.messages[1].content).toContain("Metadata requirements:")
    expect(result.created[0].plan.textModel).toBe(
      "google/gemini-3.1-flash-lite"
    )
    expect(result.created[0].plan.title).toBe("Generated Study Tips")
    expect(result.created[0].plan.caption).toBe(
      "Try these study habits before your next exam."
    )
    expect(result.created[0].plan.hashtags).toBe(
      "#studytips #learning #productivity"
    )
    const results = JSON.parse(
      await readFile(path.join(rootDir, "results", "results.json"), "utf8")
    )
    expect(results.results[0]).toMatchObject({
      title: "Generated Study Tips",
      payload: {
        caption: "Try these study habits before your next exam.",
        hashtags: "#studytips #learning #productivity",
      },
    })
    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({ text: "fixed hook" }),
      expect.objectContaining({ text: "generated body text" }),
    ])
  })

  it("randomly selects one configured hook and records the OpenRouter prompt debug payload", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Generated Hook Run",
                    caption:
                      "Use this hook to make the idea feel instantly relatable.",
                    hashtags: "#hooks #content #growth",
                    text: {
                      "content-2__text-0": "generated body text",
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
    )
    vi.stubGlobal("fetch", fetchMock)
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  id: "hook-0",
                  contentDirection: "first hook",
                },
                {
                  ...section.textItems[0],
                  id: "hook-1",
                  contentDirection: "second hook",
                },
              ],
            }
          : section.id === "body"
            ? {
                ...section,
                slideCount: 1,
                textItems: [
                  {
                    ...section.textItems[0],
                    id: "text-0",
                    contentDirection: "body text prompt",
                  },
                ],
              }
            : section.id === "cta"
              ? {
                  ...section,
                  slideCount: 0,
                }
              : section
    )
    automation.schema.prompt_formatting.num_of_slides = 2
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-brand-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-brand-scenes-2026-07-03t00-00-00-000z",
      cta_slide: {
        check: false,
        cta_collection_check: false,
        cta_collection_id: "",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/a.jpg",
        caption: "Scene A",
      },
      {
        image_link: "/api/local-assets/image-collections/files/b.jpg",
        caption: "Scene B",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0.75,
    })

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const request = JSON.parse(requestInit.body as string)
    expect(result.created[0].plan.hook).toBe("second hook")
    expect(result.created[0].plan.hookCandidates).toEqual([
      "first hook",
      "second hook",
    ])
    expect(result.created[0].plan.debug?.textModelPrompt).toEqual(request)
    expect(result.created[0].plan.debug?.selectedHookIndex).toBe(1)
    expect(result.created[0].plan.slides[0].text).toBe("second hook")
  })

  it("uses narrative hook lines instead of imported hook placeholder instructions", async () => {
    const automation = createLocalAutomationRecord({
      name: "Imported hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.prompt_formatting.narrative = [
      "5 morning habits of high-performing men",
      "7 wealth-building rules successful men follow",
    ].join("\n")
    automation.schema.prompt_formatting.num_of_slides = 1
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  contentDirection:
                    'lowercase numbered list introduction (e.g., "5 habits that _____")',
                },
              ],
            }
          : section.id === "body" || section.id === "cta"
            ? {
                ...section,
                slideCount: 0,
              }
            : section
    )
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/a.jpg",
        caption: "Scene A",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0.75,
    })

    expect(result.created[0].plan.hook).toBe(
      "7 wealth-building rules successful men follow"
    )
    expect(result.created[0].plan.hookCandidates).toEqual([
      "5 morning habits of high-performing men",
      "7 wealth-building rules successful men follow",
    ])
    expect(result.created[0].plan.slides[0].text).toBe(
      "7 wealth-building rules successful men follow"
    )
  })

  it("translates generated slideshow text through DeepL before creating the final slideshow", async () => {
    vi.stubEnv("DEEPL_KEY", "deepl-key")
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            translations: [
              { detected_source_language: "EN", text: "gancho traducido" },
              { detected_source_language: "EN", text: "cuerpo traducido" },
            ],
          }),
          { status: 200 }
        )
    )
    vi.stubGlobal("fetch", fetchMock)
    const slideshowRootDir = path.join(rootDir, "slideshows")
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      language: "Spanish",
      first_slide: {
        collection: "collection-brand-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-brand-scenes-2026-07-03t00-00-00-000z",
      cta_slide: {
        check: false,
        cta_collection_check: false,
        cta_collection_id: "",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  contentDirection: "specific hook text",
                },
              ],
            }
          : section.id === "body"
            ? {
                ...section,
                slideCount: 1,
                textItems: [
                  { ...section.textItems[0], contentDirection: "body text" },
                ],
              }
            : section.id === "cta"
              ? {
                  ...section,
                  slideCount: 0,
                }
              : section
    )
    automation.schema.prompt_formatting.num_of_slides = 2
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Brand scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link: "/api/local-assets/image-collections/files/a.jpg",
                  caption: "Scene A",
                },
                {
                  image_link: "/api/local-assets/image-collections/files/b.jpg",
                  caption: "Scene B",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      slideshowRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(request.body as string)).toMatchObject({
      text: ["specific hook text", "body text"],
      target_lang: "ES",
    })
    expect(result.created[0].plan.language).toBe("Spanish")
    expect(result.created[0].plan.slides.map((slide) => slide.text)).toEqual([
      "gancho traducido",
      "cuerpo traducido",
    ])
    const results = JSON.parse(
      await readFile(path.join(rootDir, "results", "results.json"), "utf8")
    )
    expect(
      results.results[0].payload.slides.map(
        (slide: { textItems: { text: string }[] }) => slide.textItems[0].text
      )
    ).toEqual(["gancho traducido", "cuerpo traducido"])
  })

  it("persists automation video export settings with transition, duration, and TikTok sound", async () => {
    const slideshowRootDir = path.join(rootDir, "slideshows")
    const automation = createLocalAutomationRecord({
      name: "Video slideshow",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.tiktok_post_settings = {
      ...automation.schema.tiktok_post_settings,
      publish_type: "video",
      slideshow_transition_style: "fade",
      slideshow_slide_duration: 3,
      slideshow_sound_id: "sound-123",
      slideshow_sound_name: "TikTok trend sound",
      slideshow_sound_url: "/api/local-assets/music/files/trend.mp3",
    }
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-brand-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-brand-scenes-2026-07-03t00-00-00-000z",
      cta_slide: {
        check: false,
        cta_collection_check: false,
        cta_collection_id: "",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    automation.schema.prompt_formatting.num_of_slides = 1
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "body"
          ? { ...section, slideCount: 1 }
          : section.id === "cta"
            ? { ...section, slideCount: 0 }
            : section
    )
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/video-scene.jpg",
        caption: "Video scene",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      slideshowRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    const results = JSON.parse(
      await readFile(path.join(rootDir, "results", "results.json"), "utf8")
    )
    expect(result.created[0].plan.publishType).toBe("video")
    expect(results.results[0].payload.settings).toMatchObject({
      export_as_video: true,
      duration: 3,
      transition_style: "fade",
      sound_id: "sound-123",
      sound_name: "TikTok trend sound",
      sound_url: "/api/local-assets/music/files/trend.mp3",
    })
    expect(results.results[0].payload.slides[0].time_length_ms).toBe(3000)
  })

  it("matches imported community collection ids from locally downloaded filenames", async () => {
    const automation = createLocalAutomationRecord({
      name: "Imported overlays",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "community_collection_11436",
        mode: "collection",
        single_image: null,
      },
      all_slides: "community_collection_11436",
      cta_slide: {
        check: true,
        cta_collection_check: true,
        cta_collection_id: "community_collection_11436",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    automation.schema.prompt_formatting.num_of_slides = 1
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "body" ? { ...section, slideCount: 1 } : section
    )
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Fallback scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/fallback-scene.jpg",
                  caption: "Fallback scene",
                },
              ],
            },
            {
              name: "YouTube videos (NDEs) (Overlays)",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
                  caption: "NDE overlay",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({
        imageUrl:
          "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
        imageCaption: "NDE overlay",
      }),
      expect.objectContaining({
        role: "content",
        imageUrl:
          "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
      }),
      expect.objectContaining({
        role: "cta",
        imageUrl:
          "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
      }),
    ])
  })

  it("carries configured overlay images into generated slideshow slides", async () => {
    const automation = createLocalAutomationRecord({
      name: "Overlay automation",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-base-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-base-scenes-2026-07-03t00-00-00-000z",
      cta_slide: {
        check: false,
        cta_collection_check: false,
        cta_collection_id: "",
        image_id: null,
        cta_location: "last_slide",
      },
    }
    automation.schema.prompt_formatting.num_of_slides = 2
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "body"
          ? {
              ...section,
              slideCount: 1,
              overlayImage: {
                enabled: true,
                collectionId:
                  "collection-overlay-cards-2026-07-03t00-00-00-000z",
                padding: 8,
              },
            }
          : section.id === "cta"
            ? {
                ...section,
                slideCount: 0,
              }
            : section
    )
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Base scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/base-a.jpg",
                  caption: "Base A",
                },
                {
                  image_link:
                    "/api/local-assets/image-collections/files/base-b.jpg",
                  caption: "Base B",
                },
              ],
            },
            {
              name: "Overlay cards",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/overlay-card.jpg",
                  caption: "Overlay card",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(result.created[0].plan.slides[1]).toMatchObject({
      role: "content",
      overlayImage: {
        imageUrl: "/api/local-assets/image-collections/files/overlay-card.jpg",
        imageCaption: "Overlay card",
        padding: 8,
      },
    })
    const results = JSON.parse(
      await readFile(path.join(rootDir, "results", "results.json"), "utf8")
    )
    expect(results.results[0].payload.slides[1]).toMatchObject({
      overlayImage: {
        image_url: "/api/local-assets/image-collections/files/overlay-card.jpg",
        padding: 8,
      },
    })
  })

  it("does not create duplicate runs for the same automation slot", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/daily-scene.jpg",
        caption: "Daily scene",
      },
    ])
    const now = DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate()

    await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now,
    })
    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now,
    })

    const runs = JSON.parse(
      await readFile(path.join(runRootDir, "runs.json"), "utf8")
    )
    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([
      {
        automationId: automation.id,
        reason: "already_ran",
        scheduledFor: "2026-07-03T15:00:00.000Z",
      },
    ])
    expect(runs.runs).toHaveLength(1)
  })

  it("force creates an immediate run for a selected automation even when the slot already ran", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "paused",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/daily-scene.jpg",
        caption: "Daily scene",
      },
    ])
    const now = DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate()

    const first = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now,
    })
    const second = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now,
    })
    const runs = JSON.parse(
      await readFile(path.join(runRootDir, "runs.json"), "utf8")
    )

    expect(first.created[0]).toMatchObject({
      automationId: automation.id,
      status: "succeeded",
      scheduledFor: "2026-07-03T15:05:00.000Z",
    })
    expect(second.created[0]).toMatchObject({
      automationId: automation.id,
      status: "succeeded",
      scheduledFor: "2026-07-03T15:05:00.000Z",
    })
    expect(runs.runs).toHaveLength(2)
  })

  it("uses a schema override when force generating a selected automation", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "paused",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
      },
    })
    const schemaOverride = {
      ...automation.schema,
      title: "Override slideshow",
      image_collection_ids: {
        ...automation.schema.image_collection_ids,
        first_slide: {
          collection: "collection-override-scenes-2026-07-03t00-00-00-000z",
          mode: "collection" as const,
          single_image: null,
        },
        all_slides: "collection-override-scenes-2026-07-03t00-00-00-000z",
        cta_slide: {
          check: true,
          cta_collection_check: true,
          cta_collection_id:
            "collection-override-scenes-2026-07-03t00-00-00-000z",
          image_id: null,
          cta_location: "last_slide" as const,
        },
      },
      prompt_formatting: {
        ...automation.schema.prompt_formatting,
        num_of_slides: 1,
      },
      formatting: automation.schema.formatting.map((section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  contentDirection: "override hook text",
                },
              ],
            }
          : section.id === "body"
            ? {
                ...section,
                slideCount: 1,
              }
            : section
      ),
    }
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Override scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/override.jpg",
                  caption: "Override scene",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      schemaOverride,
      force: true,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created[0].plan).toMatchObject({
      title: "Override slideshow",
      hook: "override hook text",
      slides: [
        expect.objectContaining({
          imageUrl: "/api/local-assets/image-collections/files/override.jpg",
          text: "override hook text",
        }),
        expect.objectContaining({
          role: "content",
          imageUrl: "/api/local-assets/image-collections/files/override.jpg",
        }),
        expect.objectContaining({
          role: "cta",
          imageUrl: "/api/local-assets/image-collections/files/override.jpg",
        }),
      ],
    })
  })

  it("skips paused automations and live automations that are not due", async () => {
    const paused = createLocalAutomationRecord({
      name: "Paused",
      overrides: {
        status: "paused",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    const wrongDay = createLocalAutomationRecord({
      name: "Wrong day",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Mon"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [paused, wrongDay],
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created).toEqual([])
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { automationId: paused.id, reason: "not_live" },
        { automationId: wrongDay.id, reason: "not_due" },
      ])
    )
    expect(result.skipped).toHaveLength(2)
  })

  it("records a failed run when no collection images are available", async () => {
    const automation = createLocalAutomationRecord({
      name: "No images",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeFile(
      imageCollectionDbPath,
      `${JSON.stringify({ collections: [] }, null, 2)}\n`
    )

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created[0]).toMatchObject({
      automationId: automation.id,
      status: "failed",
      error: "No images available for automation collections",
      plan: expect.objectContaining({ slides: [] }),
    })
    expect(result.skipped).toEqual([
      {
        automationId: automation.id,
        reason: "no_images",
        scheduledFor: "2026-07-03T15:00:00.000Z",
      },
    ])
    expect(result.results).toEqual([])
  })
})

async function writeImageCollections(
  images: { image_link: string; caption: string }[]
) {
  await writeFile(
    imageCollectionDbPath,
    `${JSON.stringify(
      {
        collections: [
          {
            name: "Daily scenes",
            created_at: "2026-07-03T00:00:00.000Z",
            images,
          },
        ],
      },
      null,
      2
    )}\n`
  )
}
