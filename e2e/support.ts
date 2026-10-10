import { expect, test as base, type APIRequestContext, type Locator, type Page } from "@playwright/test"

export type SeedResult = {
  collections: { id: string; name: string; mediaIds: string[] }[]
  renderId: string
}

export const SEED_RENDER_TITLE = "Seeded quote carousel"

/** Idempotent: collections dedupe by name, media by hash, the render by idempotency key. */
export async function seed(request: APIRequestContext): Promise<SeedResult> {
  const response = await request.post("/api/e2e/seed")
  expect(response.ok(), `seed returned ${response.status()}`).toBeTruthy()
  return (await response.json()) as SeedResult
}

type Problems = { console: string[]; network: string[] }

/**
 * `next dev` (Turbopack) lists a `lib/render` chunk in the next/dynamic
 * preload manifest of the new-render view that it never emits; the 404 is a
 * dev-server artifact (a production build's manifests reference only emitted
 * chunks) and the preview still loads its real chunks.
 */
function isDevOnlyChunk404(url: string) {
  return /\/_next\/static\/chunks\/[^/]*_lib_render_[^/]*\.js$/.test(url)
}

/**
 * `page` that records console errors, uncaught page errors and same-origin
 * 4xx/5xx responses; each test fails if any were seen, unless the test listed
 * the URL pattern in `allowHttpErrors` (e.g. a deliberate 422).
 */
export const test = base.extend<{ problems: Problems; allowHttpErrors: RegExp[] }>({
  allowHttpErrors: [[], { option: true }],
  problems: [
    async ({ page, baseURL, allowHttpErrors }, provide) => {
      const problems: Problems = { console: [], network: [] }
      const ignored = (url: string) =>
        allowHttpErrors.some((pattern) => pattern.test(url)) || isDevOnlyChunk404(url)
      page.on("console", (message) => {
        if (message.type() !== "error") return
        const source = message.location().url
        if (message.text().startsWith("Failed to load resource") && source && ignored(source)) return
        problems.console.push(`${message.text()}${source ? ` (${source})` : ""}`)
      })
      page.on("pageerror", (error) => problems.console.push(`pageerror: ${error.message}`))
      page.on("response", (response) => {
        const url = response.url()
        if (!baseURL || !url.startsWith(baseURL) || response.status() < 400) return
        if (ignored(url)) return
        problems.network.push(`${response.status()} ${response.request().method()} ${url.slice(baseURL.length)}`)
      })
      await provide(problems)
      expect(problems.network, "HTTP 4xx/5xx responses").toEqual([])
      expect(problems.console, "console errors").toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** The page must not scroll horizontally (AGENTS.md: 360px rule). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(overflow.scroll, `page scrollWidth ${overflow.scroll} > ${overflow.client}`).toBeLessThanOrEqual(
    overflow.client
  )
}

/** Waits until an <img> has decoded real pixels. */
export async function expectImageLoaded(image: Locator) {
  await expect
    .poll(
      () => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
      { message: "image did not load" }
    )
    .toBe(true)
}

/** True when the image's pixels are not one flat colour (i.e. something was painted). */
export async function expectImageHasContent(image: Locator) {
  await expectImageLoaded(image)
  const distinct = await image.evaluate((node: HTMLImageElement) => {
    const canvas = document.createElement("canvas")
    canvas.width = 48
    canvas.height = 48
    const context = canvas.getContext("2d")
    if (!context) return 0
    context.drawImage(node, 0, 0, canvas.width, canvas.height)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const colours = new Set<string>()
    for (let index = 0; index < data.length; index += 4) {
      colours.add(`${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4},${data[index + 3] >> 4}`)
    }
    return colours.size
  })
  expect(distinct, "image is a single flat colour").toBeGreaterThan(1)
}

/** A small generated PNG (no network, no fixtures on disk). */
export async function pngBuffer(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext("2d")!
    context.fillStyle = fill
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = "#ffffff"
    context.fillRect(8, 8, 24, 24)
    return canvas.toDataURL("image/png").split(",")[1]
  }, color)
  return Buffer.from(base64, "base64")
}

/**
 * Navigates and waits until the client bundle has hydrated (no requests in
 * flight), so the first click is not lost on a cold dev server.
 */
export async function open(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
}

/** Workspace views render inside the shell; the sidebar stays mounted. */
export function mainHeading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true })
}
