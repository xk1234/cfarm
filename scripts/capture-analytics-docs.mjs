import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const baseUrl = process.env.ANALYTICS_PREVIEW_URL || "http://localhost:3001"
const allPlatforms = [
  "overall",
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "pinterest",
  "x",
  "threads",
  "bluesky",
  "telegram",
  "google-business-profile",
  "tiktok-creative",
  "tiktok-seller",
]
const requestedPlatforms = process.argv.slice(2)
const platforms = requestedPlatforms.length ? requestedPlatforms : allPlatforms

for (const platform of platforms) {
  if (!allPlatforms.includes(platform)) {
    throw new Error(`Unknown analytics preview platform: ${platform}`)
  }
}

const browser = await chromium.launch({ headless: true })
const errors = []

for (const platform of platforms) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  })
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  const response = await page.goto(`${baseUrl}/analytics-preview/${platform}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  if (!response?.ok()) {
    throw new Error(`${platform} preview returned ${response?.status()}`)
  }
  await page.waitForSelector("h1", { timeout: 60_000 })
  await page.waitForFunction(
    (expected) =>
      expected === "overall"
        ? document.body.innerText.includes("Total audience")
        : document.body.innerText.includes("Accounts"),
    platform,
    { timeout: 60_000 }
  )
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  })
  await page.waitForTimeout(350)

  const overlayLocator = page.locator(
    "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"
  )
  const overlayCount = await overlayLocator.count()
  let visibleOverlay = false
  for (let index = 0; index < overlayCount; index += 1) {
    if (await overlayLocator.nth(index).isVisible()) {
      visibleOverlay = true
      break
    }
  }
  const bodyLength = await page
    .locator("body")
    .innerText()
    .then((text) => text.trim().length)
  if (visibleOverlay || bodyLength === 0) {
    throw new Error(`${platform} preview failed browser verification`)
  }

  await page.screenshot({
    path: path.join(rootDir, "docs", "analytics", "images", `${platform}.png`),
    fullPage: true,
  })
  await page.close()
  process.stdout.write(`captured ${platform}\n`)
}

if (errors.length) {
  throw new Error(`Browser errors:\n${[...new Set(errors)].join("\n")}`)
}

await Promise.race([
  browser.close(),
  new Promise((resolve) => setTimeout(resolve, 3_000)),
])
process.exit(0)
