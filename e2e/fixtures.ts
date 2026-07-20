import { test as base, expect, type Page, type Route } from "@playwright/test"

/* eslint-disable @typescript-eslint/no-explicit-any -- API fixtures intentionally model heterogeneous response payloads. */

const LIVE = process.env.E2E_MODE === "live"

/** A tiny in-memory store the API stubs read/write so a journey feels stateful. */
export type MockState = {
  collections: any[]
  automations: any[] // summary view-models
  automationRecords: any[]
  runs: any[]
  generatedVideos: any[]
  slideshows: any[]
  wordCollections: any[]
  assets: any[]
}

export function emptyState(): MockState {
  return {
    collections: [],
    automations: [],
    automationRecords: [],
    runs: [],
    generatedVideos: [],
    slideshows: [],
    wordCollections: [],
    assets: [],
  }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

const id = () => Math.random().toString(36).slice(2)

/**
 * Install deterministic stubs for the app's own /api/* routes. Response shapes
 * mirror the real handlers. In live mode this is a no-op so tests hit the real
 * backend. Each spec may register more specific routes BEFORE calling this, or
 * mutate `state` to seed data.
 */
export async function mockApi(page: Page, state: MockState) {
  if (LIVE) return

  // --- Image collections --------------------------------------------------
  await page.route("**/api/image-collections", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, { collections: state.collections })
    }
    if (route.request().method() === "DELETE") {
      const body = route.request().postDataJSON() as any
      const toDelete: { name: string; created_at: string }[] =
        body?.collections ?? []
      const before = state.collections.length
      state.collections = state.collections.filter(
        (c) =>
          !toDelete.some(
            (d) => d.name === c.name && d.created_at === c.created_at
          )
      )
      return json(route, {
        deleted: before - state.collections.length,
        deletedFiles: 1,
      })
    }
    return route.continue()
  })
  await page.route("**/api/image-collections/import", async (route) => {
    const collection = {
      name: "Imported collection",
      created_at: new Date().toISOString(),
      images: [
        {
          image_link: "/api/local-assets/image-collections/files/a.jpg",
          caption: "",
        },
        {
          image_link: "/api/local-assets/image-collections/files/b.jpg",
          caption: "",
        },
      ],
    }
    state.collections = [collection, ...state.collections]
    return json(route, { collection, imported: 2 }, 201)
  })
  await page.route("**/api/image-collections/captions", async (route) => {
    return json(route, { collections: state.collections })
  })

  // --- Automations --------------------------------------------------------
  await page.route("**/api/automations", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, {
        records: state.automationRecords,
        automations: state.automations,
      })
    }
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as any
      const aid = `automation-${id()}`
      const record = {
        id: aid,
        name: payload.name ?? "Untitled automation",
        status: "live",
        schema: payload.schema ?? {},
      }
      const summary = {
        id: aid,
        name: record.name,
        status: "live",
        account: "No social account",
        handle: "",
        times: [],
        favorite: false,
        theme: "ugc",
      }
      state.automationRecords = [record, ...state.automationRecords]
      state.automations = [summary, ...state.automations]
      return json(route, { automation: summary, record }, 201)
    }
    return route.continue()
  })
  await page.route("**/api/automations/run", async (route) => {
    const created = [
      {
        id: `run-${id()}`,
        automationId: state.automationRecords[0]?.id,
        status: "succeeded",
        scheduledFor: new Date().toISOString(),
        slideshowId: `slideshow-${id()}`,
        renderedSlides: [
          {
            imageUrl: "/api/local-assets/slideshows/outputs/x/slide-001.svg",
            sourceImageUrl:
              "/api/local-assets/slideshows/outputs/x/source-001.jpg",
            aspectRatio: "9:16",
          },
        ],
      },
    ]
    state.runs = [...created, ...state.runs]
    return json(route, {
      created,
      results: [{ id: `result-${created[0].id}`, workflowType: "slideshow" }],
      skipped: [],
    })
  })
  await page.route("**/api/automations/runs**", async (route) => {
    return json(route, { runs: state.runs })
  })
  await page.route("**/api/automations/*", async (route) => {
    if (route.request().method() === "DELETE") {
      const aid = route.request().url().split("/").pop()!.split("?")[0]
      state.automations = state.automations.filter((a) => a.id !== aid)
      state.automationRecords = state.automationRecords.filter(
        (a) => a.id !== aid
      )
      return json(route, {
        record: { id: aid },
        deletedRunsCount: 0,
        deletedSlideshowsCount: 0,
        deletedPostFastPostsCount: 0,
      })
    }
    // Allow more-specific mocked routes such as /api/automations/run and /runs
    // to handle the request instead of bypassing all Playwright routes.
    return route.fallback()
  })

  // --- Generated videos ---------------------------------------------------
  await page.route("**/api/generated-videos**", async (route) => {
    if (route.request().method() === "GET")
      return json(route, { exports: state.generatedVideos })
    if (route.request().method() === "POST") {
      const video = {
        id: `gv-${id()}`,
        type: "greenscreen",
        status: "ready",
        videoUrl: "/api/local-assets/greenscreen_memes/x.mp4",
        createdAt: new Date().toISOString(),
      }
      state.generatedVideos = [video, ...state.generatedVideos]
      return json(route, { export: video }, 201)
    }
    return route.continue()
  })

  // --- Slideshows ---------------------------------------------------------
  await page.route("**/api/slideshows", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, {
        slideshows: state.slideshows,
        slideshowsCount: state.slideshows.length,
        videosCount: state.slideshows.filter((s) => s.settings?.export_as_video)
          .length,
      })
    }
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as any
      const slideshow = {
        id: `slideshow-${id()}`,
        title: payload.title ?? "New Slideshow",
        ...payload,
        status: "exported",
        output_images: ["/api/local-assets/slideshows/outputs/x/slide-001.svg"],
        video_url: payload.settings?.export_as_video
          ? "/api/local-assets/slideshows/outputs/x/slideshow-export.mp4"
          : undefined,
      }
      state.slideshows = [slideshow, ...state.slideshows]
      return json(
        route,
        { slideshow, result: { id: `result-${slideshow.id}` } },
        201
      )
    }
    return route.continue()
  })

  // --- PostFast (schedule/calendar) --------------------------------------
  await page.route("**/api/postfast/**", async (route) => {
    const url = route.request().url()
    if (url.includes("/posts"))
      return json(route, { configured: false, posts: { posts: [] } })
    if (url.includes("/integrations")) return json(route, { integrations: [] })
    return json(route, {})
  })

  // --- Variable (word) collections ---------------------------------------
  await page.route("**/api/word-collections", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, { collections: state.wordCollections })
    }
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as any
      if (!payload?.name || !String(payload.name).trim()) {
        return json(route, { error: "name: name is required" }, 400)
      }
      const collection = {
        id: `word-${id()}`,
        name: payload.name,
        description: payload.description,
        words: payload.words ?? [],
        source: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      state.wordCollections = [collection, ...state.wordCollections]
      return json(route, { collection }, 201)
    }
    return route.continue()
  })
  await page.route("**/api/word-collections/*", async (route) => {
    if (route.request().method() === "DELETE") {
      const wid = route.request().url().split("/").pop()!.split("?")[0]
      state.wordCollections = state.wordCollections.filter((w) => w.id !== wid)
      return json(route, { collection: { id: wid } })
    }
    return route.continue()
  })

  // --- Assets -------------------------------------------------------------
  await page.route("**/api/assets", async (route) => {
    if (route.request().method() === "GET")
      return json(route, { assets: state.assets })
    return route.continue()
  })
  await page.route("**/api/assets/upload", async (route) => {
    const asset = {
      id: `asset-${id()}`,
      kind: "image",
      source: "upload",
      status: "ready",
      scope: "ugc_ad",
      category: "product",
      name: "Uploaded asset",
      caption: "",
      fileUrl: "/api/local-assets/assets/files/mock.png",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.assets = [asset, ...state.assets]
    return json(route, { asset }, 201)
  })
  // --- Image collection edit/upscale + delete ----------------------------
  await page.route("**/api/image-collections/image-actions", async (route) => {
    return json(route, {
      imageUrl: "/api/local-assets/image-collections/files/edited.jpg",
      taskId: `img-${id()}`,
    })
  })

  // Media requests -> tiny transparent asset so <img>/<video> don't 404 loudly.
  await page.route("**/api/local-assets/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>",
    })
  )
}

/** Click a left-nav item by its visible label. */
export async function gotoView(page: Page, label: string) {
  await page
    .locator("aside")
    .getByRole("button", { name: label, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
}

/** Call an app API from the page so Playwright's mocked route handlers apply. */
export async function appApi(
  page: Page,
  path: string,
  options: { method?: string; data?: unknown } = {}
) {
  return page.evaluate(
    async ({ path, method, data }) => {
      const response = await fetch(path, {
        method: method ?? "GET",
        headers:
          data === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      })
      const text = await response.text()
      let body: unknown
      try {
        body = text ? JSON.parse(text) : undefined
      } catch {
        body = text
      }
      return { status: response.status, body }
    },
    { path, method: options.method, data: options.data }
  )
}

export const test = base.extend<{ state: MockState }>({
  state: async ({ page }, provide) => {
    const state = emptyState()
    await mockApi(page, state)
    await provide(state)
  },
})

export { expect }
