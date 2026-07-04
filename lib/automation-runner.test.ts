import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { DateTime } from "luxon"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createLocalAutomationRecord, upsertAutomationRecords } from "@/lib/automations"
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
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeImageCollections([
      { image_link: "/api/local-assets/image-collections/files/daily-scene.jpg", caption: "Daily scene" },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    const runs = JSON.parse(await readFile(path.join(runRootDir, "runs.json"), "utf8"))

    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({
      automationId: automation.id,
      automationTitle: "Daily hooks",
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "scheduled",
    })
    expect(result.skipped).toEqual([])
    expect(runs.runs).toHaveLength(1)
    expect(result.created[0].postizRecordId).toBeUndefined()
  })

  it("builds local slideshow slides from configured image collections with top text", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map((section) =>
      section.id === "hook" ? {
        ...section,
        textItems: [{ ...section.textItems[0], contentDirection: "top hook text" }],
      } : section.id === "body" ? {
        ...section,
        slideCount: 2,
      } : section.id === "cta" ? {
        ...section,
        slideCount: 0,
        ctaLocation: "last",
      } : section
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
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeFile(imageCollectionDbPath, `${JSON.stringify({
      collections: [
        {
          name: "Brand scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            { image_link: "/api/local-assets/image-collections/files/a.jpg", caption: "Scene A" },
            { image_link: "/api/local-assets/image-collections/files/b.jpg", caption: "Scene B" },
            { image_link: "/api/local-assets/image-collections/files/c.jpg", caption: "Scene C" },
          ],
        },
      ],
    }, null, 2)}\n`)

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
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
    ])
  })

  it("fills main-app slideshow text with the same structured OpenRouter generation used by the testing center", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: {
                  "content-2__text-0": "generated body text",
                },
              }),
            },
          },
        ],
      }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map((section) =>
      section.id === "hook" ? {
        ...section,
        textItems: [{ ...section.textItems[0], id: "hook-0", contentDirection: "fixed hook" }],
      } : section.id === "body" ? {
        ...section,
        slideCount: 1,
        textItems: [{ ...section.textItems[0], id: "text-0", contentDirection: "body text prompt" }],
      } : section.id === "cta" ? {
        ...section,
        slideCount: 0,
      } : section
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
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeFile(imageCollectionDbPath, `${JSON.stringify({
      collections: [
        {
          name: "Brand scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            { image_link: "/api/local-assets/image-collections/files/a.jpg", caption: "Scene A" },
            { image_link: "/api/local-assets/image-collections/files/b.jpg", caption: "Scene B" },
          ],
        },
      ],
    }, null, 2)}\n`)

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const request = JSON.parse(requestInit.body as string)
    expect(request.model).toBe("google/gemini-3.1-flash-lite")
    expect(request.response_format.json_schema.name).toBe("temp_slide_testing_text")
    expect(request.messages[1].content).toContain("body text prompt")
    expect(result.created[0].plan.textModel).toBe("google/gemini-3.1-flash-lite")
    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({ text: "fixed hook" }),
      expect.objectContaining({ text: "generated body text" }),
    ])
  })

  it("translates generated slideshow text through DeepL before creating the final slideshow", async () => {
    vi.stubEnv("DEEPL_API_KEY", "deepl-key")
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        translations: [
          { detected_source_language: "EN", text: "gancho traducido" },
          { detected_source_language: "EN", text: "cuerpo traducido" },
        ],
      }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)
    const slideshowRootDir = path.join(rootDir, "slideshows")
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
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
    automation.schema.formatting = automation.schema.formatting.map((section) =>
      section.id === "hook" ? {
        ...section,
        textItems: [{ ...section.textItems[0], contentDirection: "hook text" }],
      } : section.id === "body" ? {
        ...section,
        slideCount: 1,
        textItems: [{ ...section.textItems[0], contentDirection: "body text" }],
      } : section.id === "cta" ? {
        ...section,
        slideCount: 0,
      } : section
    )
    automation.schema.prompt_formatting.num_of_slides = 2
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeFile(imageCollectionDbPath, `${JSON.stringify({
      collections: [
        {
          name: "Brand scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            { image_link: "/api/local-assets/image-collections/files/a.jpg", caption: "Scene A" },
            { image_link: "/api/local-assets/image-collections/files/b.jpg", caption: "Scene B" },
          ],
        },
      ],
    }, null, 2)}\n`)

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      slideshowRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(request.body as string)).toMatchObject({
      text: ["hook text", "body text"],
      target_lang: "ES",
    })
    expect(result.created[0].plan.language).toBe("Spanish")
    expect(result.created[0].plan.slides.map((slide) => slide.text)).toEqual([
      "gancho traducido",
      "cuerpo traducido",
    ])
    const slideshows = JSON.parse(await readFile(path.join(slideshowRootDir, "slideshows.json"), "utf8"))
    expect(slideshows.slideshows[0].images.map((slide: { textItems: { text: string }[] }) => slide.textItems[0].text)).toEqual([
      "gancho traducido",
      "cuerpo traducido",
    ])
  })

  it("matches imported community collection ids from locally downloaded filenames", async () => {
    const automation = createLocalAutomationRecord({
      name: "Imported overlays",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
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
    automation.schema.formatting = automation.schema.formatting.map((section) =>
      section.id === "body" ? { ...section, slideCount: 1 } : section
    )
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeFile(imageCollectionDbPath, `${JSON.stringify({
      collections: [
        {
          name: "Fallback scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/fallback-scene.jpg",
              caption: "Fallback scene",
            },
          ],
        },
        {
          name: "YouTube videos (NDEs) (Overlays)",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
              caption: "NDE overlay",
            },
          ],
        },
      ],
    }, null, 2)}\n`)

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
        imageCaption: "NDE overlay",
      }),
    ])
  })

  it("does not create duplicate runs for the same automation slot", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeImageCollections([
      { image_link: "/api/local-assets/image-collections/files/daily-scene.jpg", caption: "Daily scene" },
    ])
    const now = DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate()

    await runDueAutomations({ automationRootDir, runRootDir, postizRootDir: rootDir, imageCollectionDbPath, now })
    const result = await runDueAutomations({ automationRootDir, runRootDir, postizRootDir: rootDir, imageCollectionDbPath, now })

    const runs = JSON.parse(await readFile(path.join(runRootDir, "runs.json"), "utf8"))
    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([{ automationId: automation.id, reason: "already_ran", scheduledFor: "2026-07-03T15:00:00.000Z" }])
    expect(runs.runs).toHaveLength(1)
  })

  it("force creates an immediate run for a selected automation even when the slot already ran", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "paused",
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeImageCollections([
      { image_link: "/api/local-assets/image-collections/files/daily-scene.jpg", caption: "Daily scene" },
    ])
    const now = DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate()

    const first = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now,
    })
    const second = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now,
    })
    const runs = JSON.parse(await readFile(path.join(runRootDir, "runs.json"), "utf8"))

    expect(first.created[0]).toMatchObject({
      automationId: automation.id,
      status: "scheduled",
      scheduledFor: "2026-07-03T15:05:00.000Z",
    })
    expect(second.created[0]).toMatchObject({
      automationId: automation.id,
      status: "scheduled",
      scheduledFor: "2026-07-03T15:05:00.000Z",
    })
    expect(runs.runs).toHaveLength(2)
  })

  it("uses a schema override when force generating a selected automation", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "paused",
        tiktok_account_id: "tiktok-1",
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
          cta_collection_id: "collection-override-scenes-2026-07-03t00-00-00-000z",
          image_id: null,
          cta_location: "last_slide" as const,
        },
      },
      prompt_formatting: {
        ...automation.schema.prompt_formatting,
        num_of_slides: 1,
      },
      formatting: automation.schema.formatting.map((section) =>
        section.id === "hook" ? {
          ...section,
          textItems: [{ ...section.textItems[0], contentDirection: "override hook text" }],
        } : section.id === "body" ? {
          ...section,
          slideCount: 1,
        } : section
      ),
    }
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeFile(imageCollectionDbPath, `${JSON.stringify({
      collections: [
        {
          name: "Override scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            { image_link: "/api/local-assets/image-collections/files/override.jpg", caption: "Override scene" },
          ],
        },
      ],
    }, null, 2)}\n`)

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
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
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [paused, wrongDay] })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      { automationId: paused.id, reason: "not_live" },
      { automationId: wrongDay.id, reason: "not_due" },
    ]))
    expect(result.skipped).toHaveLength(2)
  })

  it("records a failed run when no collection images are available", async () => {
    const automation = createLocalAutomationRecord({
      name: "No images",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({ rootDir: automationRootDir, records: [automation] })
    await writeFile(imageCollectionDbPath, `${JSON.stringify({ collections: [] }, null, 2)}\n`)

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postizRootDir: rootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created[0]).toMatchObject({
      automationId: automation.id,
      status: "failed",
      error: "No images available for automation collections",
      plan: expect.objectContaining({ slides: [] }),
    })
    expect(result.skipped).toEqual([{ automationId: automation.id, reason: "no_images", scheduledFor: "2026-07-03T15:00:00.000Z" }])
  })
})

async function writeImageCollections(images: { image_link: string; caption: string }[]) {
  await writeFile(imageCollectionDbPath, `${JSON.stringify({
    collections: [
      {
        name: "Daily scenes",
        created_at: "2026-07-03T00:00:00.000Z",
        images,
      },
    ],
  }, null, 2)}\n`)
}
