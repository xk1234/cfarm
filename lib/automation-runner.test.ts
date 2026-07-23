import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { DateTime } from "luxon"
import { Query } from "node-appwrite"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import {
  deleteAssetFromAppwrite,
  mirrorAssetToAppwrite,
} from "@/lib/asset-storage"
import { VITEST_OWNER_ID } from "@/lib/test-helpers"
import {
  createLocalAutomationRecord,
  listAutomationRecords,
  upsertAutomationRecords as persistAutomationRecords,
} from "@/lib/automations"
import {
  automationSlideshowSettings,
  imagesForSlideSection,
  previewAutomationRunPlan,
  runDueAutomations,
} from "@/lib/automation-runner"
import {
  automationHookItems,
  isAutomationHookInstruction,
} from "@/lib/realfarm-automation"
import { defaultSlideshowTextModel } from "@/lib/realfarm-generation-model-registry"
import {
  readJsonArrayStore,
  writeJsonArrayStore as persistJsonArrayStore,
} from "@/lib/json-store"
import { appendUsageRecords } from "@/lib/usage-ledger"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts). Every
// injected rootDir points under <cwd>/data so the stores map to their tables.
let rootDir: string
let dataDir: string
let automationRootDir: string
let runRootDir: string
let imageCollectionDbPath: string
let wordCollectionRootDir: string
let usageLedgerRootDir: string
const testAssetPaths = new Set<string>()

type StoredTestResult = {
  artifacts: { slideshowId?: string }
  payload: {
    settings: Record<string, unknown>
    slides: Array<{
      textItems: Array<{ text: string }>
      overlayImage?: { image_url?: string; padding?: number }
    }>
  }
}

async function clearTable(table: string) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured for tests.")
  for (;;) {
    const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, table, [
      Query.equal("owner_id", [VITEST_OWNER_ID]),
      Query.limit(100),
    ])
    for (const row of res.rows) {
      await aw.tables.deleteRow(APPWRITE_DATABASE_ID, table, String(row.$id))
    }
    if (res.rows.length < 100) break
  }
}

async function clearAll() {
  for (const table of [
    "automations",
    "automation_runs",
    "image_collections",
    "word_collections",
    "usage_ledger",
    "slideshows",
    "results",
    "postfast_posts",
  ]) {
    await clearTable(table)
  }
}

async function readRuns() {
  return readJsonArrayStore<Record<string, unknown>>({
    rootDir: runRootDir,
    fileName: "runs.json",
    key: "runs",
  })
}

async function readResults() {
  return readJsonArrayStore<StoredTestResult>({
    rootDir: path.join(dataDir, "results"),
    fileName: "results.json",
    key: "results",
  })
}

async function readUsage() {
  return readJsonArrayStore<Record<string, unknown>>({
    rootDir: usageLedgerRootDir,
    fileName: "usage-ledger.json",
    key: "usage",
  })
}

beforeEach(async () => {
  await clearAll()
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-automation-runner-"))
  dataDir = path.join(rootDir, "data")
  automationRootDir = path.join(dataDir, "automations")
  runRootDir = path.join(dataDir, "automations")
  imageCollectionDbPath = path.join(dataDir, "image-collections.json")
  wordCollectionRootDir = path.join(dataDir, "word-collections")
  usageLedgerRootDir = dataDir
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(rootDir)
  // Generation is required in the current runtime. Keep unit tests offline by
  // providing a deterministic OpenRouter response; provider-specific tests
  // replace this stub with their own response.
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
  vi.stubEnv("DEEPL_API_KEY", "")
  vi.stubEnv("KIE_KEY", "")
  vi.stubGlobal("fetch", vi.fn(defaultOpenRouterFetch))
})

afterEach(async () => {
  await Promise.all(
    [...testAssetPaths].map((assetPath) =>
      deleteAssetFromAppwrite(assetPath).catch(() => undefined)
    )
  )
  testAssetPaths.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(rootDir, { recursive: true, force: true })
})

afterAll(clearAll)

describe("runDueAutomations", () => {
  it("reserves caption-tagged hook and CTA assets for their slide sections", () => {
    const images = [
      { id: "hook", imageCaption: "Hook asset: polar bear cutouts" },
      { id: "body", imageCaption: "Comparison asset: bottle swap" },
      { id: "cta", imageCaption: "CTA asset: waving polar bear" },
    ]

    expect(
      imagesForSlideSection(images, "hook").map((image) => image.id)
    ).toEqual(["hook"])
    expect(
      imagesForSlideSection(images, "content").map((image) => image.id)
    ).toEqual(["body"])
    expect(
      imagesForSlideSection(images, "cta").map((image) => image.id)
    ).toEqual(["cta"])
  })

  it("expands hook slots from word collections and records template substitutions", async () => {
    const automation = createLocalAutomationRecord({
      name: "Zodiac charms",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.hook_slots = {
      zodiac: "zodiac",
      charm: "charm",
    }
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  contentDirection:
                    "POV: you're a [[zodiac]] and someone gifts you a [[charm]]",
                },
              ],
            }
          : section.id === "body" || section.id === "cta"
            ? { ...section, slideCount: 0 }
            : section
    )
    automation.schema.image_collection_ids.cta_slide.check = false
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeWordCollections([
      { id: "zodiac", words: ["aries", "taurus", "gemini"] },
      { id: "charm", words: ["bracelet", "jade ring"] },
    ])
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/charm-a.jpg",
        caption: "Charm A",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0.6,
    })

    expect(result.created[0].plan).toMatchObject({
      hook: "POV: you're a Taurus and someone gifts you a jade ring",
      hookTemplate:
        "POV: you're a [[zodiac]] and someone gifts you a [[charm]]",
      hookSubstitutions: {
        zodiac: "Taurus",
        charm: "jade ring",
      },
    })
    expect(result.created[0].plan.slides[0].text).toBe(
      "POV: you're a Taurus and someone gifts you a jade ring"
    )
  })

  it("rejects missing hook collections before persisting a run", async () => {
    const automation = createLocalAutomationRecord({
      name: "Broken hook variable",
      overrides: {
        status: "live",
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
                  contentDirection: "I’m [[ZODIAC_WITH_ARTICLE]]",
                },
              ],
            }
          : section
    )
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/astro.jpg",
        caption: "Astrology scene",
      },
    ])

    await expect(
      runDueAutomations({
        automationRootDir,
        runRootDir,
        postfastRootDir: dataDir,
        usageLedgerRootDir,
        wordCollectionRootDir,
        imageCollectionDbPath,
        now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      })
    ).rejects.toThrow(
      "Hook slot ZODIAC_WITH_ARTICLE has no words in database collection ZODIAC_WITH_ARTICLE"
    )
    expect(await readRuns()).toEqual([])
  })

  it("allows hook and image reuse until a generation is published", async () => {
    const automation = createLocalAutomationRecord({
      name: "Dedup stress",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.hook_slots = { occasion: "occasion" }
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                {
                  ...section.textItems[0],
                  contentDirection:
                    "[[occasion]] balloon setups that broke our group chat",
                },
              ],
            }
          : section.id === "body" || section.id === "cta"
            ? { ...section, slideCount: 0 }
            : section
    )
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeWordCollections([
      { id: "occasion", words: ["wedding", "birthday"] },
    ])
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/balloon-a.jpg",
        caption: "Balloon A",
      },
      {
        image_link: "/api/local-assets/image-collections/files/balloon-b.jpg",
        caption: "Balloon B",
      },
      {
        image_link: "/api/local-assets/image-collections/files/balloon-c.jpg",
        caption: "Balloon C",
      },
      {
        image_link: "/api/local-assets/image-collections/files/balloon-d.jpg",
        caption: "Balloon D",
      },
    ])

    const first = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })
    const second = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now: DateTime.fromISO("2026-07-03T16:05:00.000Z").toJSDate(),
      random: () => 0,
    })
    const third = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now: DateTime.fromISO("2026-07-03T17:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(first.created[0].plan.hook).toBe(
      "wedding balloon setups that broke our group chat"
    )
    expect(second.created[0].plan.hook).toBe(
      "wedding balloon setups that broke our group chat"
    )
    expect(first.created[0].plan.slides[0].imageUrl).toBe(
      "/api/local-assets/image-collections/files/balloon-a.jpg"
    )
    expect(second.created[0].plan.slides[0].imageUrl).toBe(
      "/api/local-assets/image-collections/files/balloon-a.jpg"
    )
    expect(third.created[0]).toMatchObject({ status: "succeeded" })
    expect(third.skipped).toEqual([])
    const storedAutomation = (
      await listAutomationRecords({
        rootDir: automationRootDir,
      })
    ).find((record) => record.id === automation.id)
    const storedHookSection = storedAutomation?.schema.formatting.find(
      (section) => section.id === "hook" && "textItems" in section
    )
    expect(
      storedHookSection && "textItems" in storedHookSection
        ? storedHookSection.textItems[0]?.contentDirection
        : undefined
    ).toBe("[[occasion]] balloon setups that broke our group chat")
  })

  it("reuses an image when a slideshow has more slides than unique images", async () => {
    const automation = createLocalAutomationRecord({
      name: "Reuse warning",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "body"
          ? {
              ...section,
              slideCount: 2,
              slideOverrides: [
                { slideIndex: 1, contentDirection: "first angle" },
                { slideIndex: 2, contentDirection: "second angle" },
              ],
            }
          : section.id === "cta"
            ? { ...section, slideCount: 0 }
            : section
    )
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/old.jpg",
        caption: "Old scene",
        hash: "hash-old",
      },
    ])
    await appendUsageRecords({
      rootDir: usageLedgerRootDir,
      records: [
        {
          automation_id: automation.id,
          kind: "image",
          key: "hash-old",
          run_id: "run-old",
          used_at: "2026-07-01T10:00:00.000Z",
        },
      ],
      now: new Date("2026-07-07T10:00:00.000Z"),
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now: DateTime.fromISO("2026-07-07T10:00:00.000Z").toJSDate(),
      random: () => 0.9,
    })

    expect(result.created[0]).toMatchObject({ status: "succeeded" })
    expect(result.skipped).toEqual([])
    const slides = result.created[0].plan.slides
    expect(slides.length).toBeGreaterThan(1)
    expect(new Set(slides.map((slide) => slide.imageUrl))).toEqual(
      new Set(["/api/local-assets/image-collections/files/old.jpg"])
    )
  })

  it("routes usage ledger writes to the temp run root when no ledger root is passed", async () => {
    const automation = createLocalAutomationRecord({
      name: "Temp ledger",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "body" || section.id === "cta"
          ? { ...section, slideCount: 0 }
          : section
    )
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/temp-a.jpg",
        caption: "Temp scene",
      },
    ])

    await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(JSON.stringify(await readUsage())).toContain("temp-a.jpg")
  })

  it("does not record placeholder narrative instructions as hook usage", async () => {
    const automation = createLocalAutomationRecord({
      name: "Instruction filter",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.prompt_formatting.narrative =
      "Create a concise slideshow narrative for the selected topic."
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "body" || section.id === "cta"
          ? { ...section, slideCount: 0 }
          : section
    )
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link:
          "/api/local-assets/image-collections/files/instruction-a.jpg",
        caption: "Instruction scene",
      },
    ])

    await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    const stored = { usage: await readUsage() }
    expect(stored.usage).not.toContainEqual(
      expect.objectContaining({
        kind: "hook",
        key: "create a concise slideshow narrative for the selected topic.",
      })
    )
    expect(stored.usage).toContainEqual(
      expect.objectContaining({ kind: "image" })
    )
  })

  it("claims jittered schedule slots and skips disabled slots", async () => {
    const automation = createLocalAutomationRecord({
      name: "Interval slots",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [
            { time: "9:00 AM", days: ["Fri"], enabled: false },
            { time: "12:00 PM", days: ["Fri"] },
          ],
          jitter_minutes: 15,
        },
      },
    })
    selectDailyScenesCollection(automation)
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/slot.jpg",
        caption: "Slot",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T16:20:00.000Z").toJSDate(),
      lookbackMinutes: 10,
      random: () => 1,
    })

    expect(result.created.map((run) => run.scheduledFor)).toEqual([
      "2026-07-03T16:15:00.000Z",
    ])
  })

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
    selectDailyScenesCollection(automation)
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
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    const runs = { runs: await readRuns() }
    const results = { results: await readResults() }

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
    expect(results.results).toContainEqual(
      expect.objectContaining({
        artifacts: expect.objectContaining({
          slideshowId: result.created[0].slideshowId,
        }),
      })
    )
  })

  it("builds local slideshow slides using the configured text placement", async () => {
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
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
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/a.jpg",
        imageCaption: "Scene A",
        text: "top hook text",
        textPlacement: "center",
      }),
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/b.jpg",
        imageCaption: "Scene B",
        textPlacement: "center",
      }),
      expect.objectContaining({
        imageUrl: "/api/local-assets/image-collections/files/c.jpg",
        imageCaption: "Scene C",
        textPlacement: "center",
      }),
      expect.objectContaining({
        role: "cta",
        imageUrl: "/api/local-assets/image-collections/files/a.jpg",
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
                      "content-2__text-0":
                        "generated body text about the fixed hook",
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
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
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
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
    expect(request.model).toBe(defaultSlideshowTextModel)
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
    expect(result.created[0].plan.textModel).toBe(defaultSlideshowTextModel)
    expect(result.created[0].plan.title).toBe("Generated Study Tips")
    expect(result.created[0].plan.caption).toBe(
      "Try these study habits before your next exam."
    )
    expect(result.created[0].plan.hashtags).toBe(
      "#studytips #learning #productivity"
    )
    const results = { results: await readResults() }
    expect(results.results[0]).toMatchObject({
      title: "Generated Study Tips",
      payload: {
        caption: "Try these study habits before your next exam.",
        hashtags: "#studytips #learning #productivity",
      },
    })
    expect(result.created[0].plan.slides).toEqual([
      expect.objectContaining({ text: "fixed hook" }),
      expect.objectContaining({
        text: "generated body text about the fixed hook",
      }),
    ])
  })

  it("repairs generated copy against locked selected-image captions", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
    const outputs = [
      {
        title: "Lower-impact habits",
        caption: "Small changes add up.",
        hashtags: "#sustainability #habits #ecoliving",
        text: {
          "content-2__text-0":
            "lower-impact habit: bring reusable bags to the grocery store",
        },
      },
      {
        title: "Lower-impact habits",
        caption: "Small changes add up.",
        hashtags: "#sustainability #habits #ecoliving",
        text: {
          "content-2__text-0":
            "lower-impact habit: unplug unused chargers to reduce standby power",
        },
      },
    ]
    const fetchMock = vi.fn(async () => {
      const output = outputs.shift()
      if (!output) throw new Error("Unexpected extra generation request")
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
        { status: 200 }
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const automation = createLocalAutomationRecord({
      name: "Eco habits",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Eco TikTok",
            profile: "eco",
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
                  contentDirection: "lower-impact habits",
                },
              ],
            }
          : section.id === "body"
            ? {
                ...section,
                slideCount: 1,
                aiImageSelection: true,
                textItems: [
                  {
                    ...section.textItems[0],
                    id: "text-0",
                    contentDirection: "one concrete lower-impact habit",
                  },
                ],
              }
            : section.id === "cta"
              ? { ...section, slideCount: 0 }
              : section
    )
    automation.schema.prompt_formatting.num_of_slides = 2
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-eco-scenes-2026-07-19t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-eco-scenes-2026-07-19t00-00-00-000z",
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
        {
          name: "Eco scenes",
          created_at: "2026-07-19T00:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/eco.jpg",
              caption: "EcoGPT mascot holding a recycling symbol",
            },
            {
              image_link:
                "/api/local-assets/image-collections/files/charger.jpg",
              caption: "Phone charger being unplugged from a wall outlet",
            },
          ],
        },
      ],
    })

    const result = await previewAutomationRunPlan(automation.schema, {
      automationId: automation.id,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      random: () => 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, repairInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ]
    const repairRequest = JSON.parse(repairInit.body as string)
    expect(repairRequest.messages[1].content).toContain(
      "Phone charger being unplugged from a wall outlet"
    )
    expect(repairRequest.messages[1].content).toContain(
      "lower-impact habit: bring reusable bags to the grocery store"
    )
    expect(result.plan.debug?.imageTextCoherenceRepair).toBe(true)
    expect(result.plan.slides[1]).toMatchObject({
      imageCaption: "Phone charger being unplugged from a wall outlet",
      text: "lower-impact habit: unplug unused chargers to reduce standby power",
    })
  })

  it("fails the run instead of substituting text when generation is unavailable", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const automation = createLocalAutomationRecord({
      name: "UAT Zodiac lucky charms",
      overrides: {
        status: "live",
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
                    contentDirection: "",
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
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-daily-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-daily-scenes-2026-07-03t00-00-00-000z",
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
        caption: "Lucky charm closeup",
      },
      {
        image_link: "/api/local-assets/image-collections/files/b.jpg",
        caption: "Zodiac gift table",
      },
    ])

    await expect(
      runDueAutomations({
        automationRootDir,
        runRootDir,
        postfastRootDir: dataDir,
        usageLedgerRootDir,
        wordCollectionRootDir,
        imageCollectionDbPath,
        now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
        random: () => 0,
      })
    ).rejects.toThrow("OPENROUTER_API_KEY is not configured")

    await expect(readRuns()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          automationId: automation.id,
          status: "failed",
          error: "OPENROUTER_API_KEY is not configured",
        }),
      ])
    )
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
                      "content-2__text-0":
                        "generated body text about the second hook",
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
    automation.schema.hooks = [
      {
        id: "first",
        text: "first hook",
        enabled: true,
        createdAt: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "second",
        text: "second hook",
        enabled: true,
        createdAt: "2026-07-03T00:00:00.000Z",
      },
    ]
    automation.schema.prompt_formatting.num_of_slides = 2
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-daily-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-daily-scenes-2026-07-03t00-00-00-000z",
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
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
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

  it("uses canonical hooks instead of narrative or formatting instructions", async () => {
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
    automation.schema.hooks = [
      {
        id: "morning-habits",
        text: "5 morning habits of high-performing men",
        enabled: true,
        createdAt: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "wealth-rules",
        text: "7 wealth-building rules successful men follow",
        enabled: true,
        createdAt: "2026-07-03T00:00:00.000Z",
      },
    ]
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
    selectDailyScenesCollection(automation)
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
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
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
    const fetchMock = vi.fn(async (input: string | URL | Request, init) => {
      if (String(input).includes("openrouter.ai")) {
        return defaultOpenRouterFetch(input, init)
      }
      return new Response(
        JSON.stringify({
          translations: [
            { detected_source_language: "EN", text: "gancho traducido" },
            { detected_source_language: "EN", text: "cuerpo traducido" },
          ],
        }),
        { status: 200 }
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const slideshowRootDir = path.join(dataDir, "slideshows")
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
    automation.schema.language = "Spanish"
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
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
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      slideshowRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
      random: () => 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, request] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(request.body as string)).toMatchObject({
      text: ["specific hook text", "specific hook text detail 1"],
      target_lang: "ES",
    })
    expect(result.created[0].plan.language).toBe("Spanish")
    expect(result.created[0].plan.slides.map((slide) => slide.text)).toEqual([
      "gancho traducido",
      "cuerpo traducido",
    ])
    const results = { results: await readResults() }
    expect(
      results.results[0].payload.slides.map(
        (slide: { textItems: { text: string }[] }) => slide.textItems[0].text
      )
    ).toEqual(["gancho traducido", "cuerpo traducido"])
  })

  it("maps automation video export settings without rendering a video", () => {
    const automation = createLocalAutomationRecord({
      name: "Video slideshow",
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
    expect(automationSlideshowSettings(automation.schema)).toMatchObject({
      export_as_video: true,
      duration: 3,
      transition_style: "fade",
      sound_id: "sound-123",
      sound_name: "TikTok trend sound",
      sound_url: "/api/local-assets/music/files/trend.mp3",
    })
    expect(
      typeof automationSlideshowSettings(automation.schema).aspect_ratio
    ).toBe("string")
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
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
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
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
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
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
    const results = { results: await readResults() }
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
    selectDailyScenesCollection(automation)
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
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now,
    })
    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now,
    })

    const runs = { runs: await readRuns() }
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

  it("claims a due slot before generation so overlapping invocations skip it", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
    let releaseGeneration: () => void = () => undefined
    const generationReleased = new Promise<void>((resolve) => {
      releaseGeneration = resolve
    })
    let generationStarted: () => void = () => undefined
    const generationStartedPromise = new Promise<void>((resolve) => {
      generationStarted = resolve
    })
    const fetchMock = vi.fn(async (input: string | URL | Request, init) => {
      generationStarted()
      await generationReleased
      return defaultOpenRouterFetch(input, init)
    })
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
    selectDailyScenesCollection(automation)
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

    const firstPromise = runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now,
    })
    await generationStartedPromise

    const claimedRuns = { runs: await readRuns() }
    expect(claimedRuns.runs).toHaveLength(1)
    expect(claimedRuns.runs[0]).toMatchObject({
      automationId: automation.id,
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "running",
    })

    const second = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now,
    })
    releaseGeneration()
    const first = await firstPromise
    const runs = { runs: await readRuns() }

    expect(second.created).toEqual([])
    expect(second.skipped).toEqual([
      {
        automationId: automation.id,
        reason: "already_ran",
        scheduledFor: "2026-07-03T15:00:00.000Z",
      },
    ])
    expect(first.created).toHaveLength(1)
    expect(runs.runs).toHaveLength(1)
    expect(runs.runs[0]).toMatchObject({
      id: first.created[0].id,
      status: "succeeded",
    })
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
    selectDailyScenesCollection(automation)
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
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now,
    })
    const second = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now,
    })
    const runs = { runs: await readRuns() }

    expect(first.created[0]).toMatchObject({
      automationId: automation.id,
      status: "succeeded",
      scheduledFor: "2026-07-03T15:05:00.000Z",
      generationSource: "manual",
    })
    expect(second.created[0]).toMatchObject({
      automationId: automation.id,
      status: "succeeded",
      scheduledFor: "2026-07-03T15:05:00.000Z",
    })
    expect(runs.runs).toHaveLength(2)
  })

  it("force generates from the schema persisted in the database", async () => {
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
      records: [{ ...automation, schema: schemaOverride }],
    })
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [
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
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      automationId: automation.id,
      force: true,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created[0].plan).toMatchObject({
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
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
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

  it("does not claim a run when no collection images are available", async () => {
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
    await writeJsonArrayStore({
      rootDir: dataDir,
      fileName: "image-collections.json",
      key: "collections",
      records: [],
    })

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([
      {
        automationId: automation.id,
        reason: "no_images",
        scheduledFor: "2026-07-03T15:00:00.000Z",
      },
    ])
    expect(result.results).toEqual([])
  })

  it("does not claim a run or fall back when the configured collection is missing", async () => {
    const automation = createLocalAutomationRecord({
      name: "Invalid collection",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "missing-import-placeholder",
        mode: "collection",
        single_image: null,
      },
      all_slides: "missing-import-placeholder",
    }
    await upsertAutomationRecords({
      rootDir: automationRootDir,
      records: [automation],
    })
    await writeImageCollections([
      {
        image_link: "/api/local-assets/image-collections/files/unrelated.jpg",
        caption: "Unrelated image",
      },
    ])

    const result = await runDueAutomations({
      automationRootDir,
      runRootDir,
      postfastRootDir: dataDir,
      usageLedgerRootDir,
      wordCollectionRootDir,
      imageCollectionDbPath,
      now: DateTime.fromISO("2026-07-03T15:05:00.000Z").toJSDate(),
    })

    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([
      {
        automationId: automation.id,
        reason: "no_images",
        scheduledFor: "2026-07-03T15:00:00.000Z",
      },
    ])
  })
})

async function writeImageCollections(
  images: { image_link: string; caption: string; hash?: string }[]
) {
  await writeJsonArrayStore({
    rootDir: dataDir,
    fileName: "image-collections.json",
    key: "collections",
    records: [
      {
        name: "Daily scenes",
        created_at: "2026-07-03T00:00:00.000Z",
        images,
      },
    ],
  })
}

async function upsertAutomationRecords(
  input: Parameters<typeof persistAutomationRecords>[0]
) {
  for (const record of input.records) {
    // Publishing is covered by the PostFast suites. Runner tests exercise
    // generation and persistence without making provider network requests.
    record.schema.social_integrations = []
    if (automationHookItems(record.schema).length > 0) continue
    const storedHook = record.schema.formatting
      .find((section) => section.id === "hook")
      ?.textItems.map((item) =>
        item.textMode === "static" ? item.staticText : item.contentDirection
      )
      .find((hook) => hook && !isAutomationHookInstruction(hook))
    const text = storedHook || "test automation hook"
    record.schema.hooks = [
      {
        id: "test-hook",
        text,
        enabled: true,
        createdAt: new Date(0).toISOString(),
      },
    ]
  }
  return persistAutomationRecords(input)
}

async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  await persistJsonArrayStore(input)
  if (input.fileName !== "image-collections.json") return
  const imageUrls = input.records.flatMap((record) => {
    if (!record || typeof record !== "object" || !("images" in record)) {
      return []
    }
    const images = (record as { images?: unknown }).images
    if (!Array.isArray(images)) return []
    return images.flatMap((image) => {
      if (
        !image ||
        typeof image !== "object" ||
        !("image_link" in image) ||
        typeof image.image_link !== "string"
      ) {
        return []
      }
      return [image.image_link]
    })
  })
  await Promise.all(
    imageUrls.map(async (url) => {
      const prefix = "/api/local-assets/"
      if (!url.startsWith(prefix)) return
      const assetPath = path.join(dataDir, url.slice(prefix.length))
      testAssetPaths.add(assetPath)
      await mirrorAssetToAppwrite(assetPath, testPng)
    })
  )
}

async function defaultOpenRouterFetch(
  input: string | URL | Request,
  init?: RequestInit
) {
  if (!String(input).includes("openrouter.ai")) {
    throw new Error(`Unexpected test request: ${String(input)}`)
  }
  const request = JSON.parse(String(init?.body ?? "{}")) as {
    messages?: Array<{ content?: string }>
    response_format?: {
      json_schema?: {
        schema?: {
          properties?: {
            text?: {
              required?: string[]
              properties?: Record<string, unknown>
            }
          }
        }
      }
    }
  }
  const prompt = request.messages?.at(-1)?.content ?? ""
  const hook = prompt.match(/^Hook:\s*(.+)$/m)?.[1]?.trim() || "test hook"
  const textSchema =
    request.response_format?.json_schema?.schema?.properties?.text
  const textKeys =
    textSchema?.required ?? Object.keys(textSchema?.properties ?? {})
  const text = Object.fromEntries(
    textKeys.map((key, index) => [key, `${hook} detail ${index + 1}`])
  )
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: `${hook} guide`,
              caption: `A practical guide to ${hook}.`,
              hashtags: "#test",
              text,
            }),
          },
        },
      ],
    }),
    { status: 200 }
  )
}

const testPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

function selectDailyScenesCollection(
  automation: ReturnType<typeof createLocalAutomationRecord>
) {
  automation.schema.image_collection_ids = {
    ...automation.schema.image_collection_ids,
    first_slide: {
      ...automation.schema.image_collection_ids.first_slide,
      collection: "collection-daily-scenes-2026-07-03t00-00-00-000z",
      mode: "collection",
    },
    all_slides: "collection-daily-scenes-2026-07-03t00-00-00-000z",
  }
}

async function writeWordCollections(
  collections: { id: string; words: string[] }[]
) {
  await writeJsonArrayStore({
    rootDir: wordCollectionRootDir,
    fileName: "word-collections.json",
    key: "collections",
    records: collections.map((collection) => ({
      id: collection.id,
      name: collection.id,
      words: collection.words,
      source: "manual",
      created_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z",
    })),
  })
}
