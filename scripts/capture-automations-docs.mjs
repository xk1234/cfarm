import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
// MDX references these assets as `/docs/automations/...`, which Next serves
// from `public/docs/automations`.
const outputDir = path.join(rootDir, "public", "docs", "automations")
const baseUrl = process.env.AUTOMATIONS_DOCS_URL || "http://localhost:3000"
const email =
  process.env.AUTOMATIONS_DOCS_EMAIL || "docs-automations@example.com"
const password = process.env.AUTOMATIONS_DOCS_PASSWORD || "DocsCapture1234"

await fs.mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
})

await authenticate()
await seedAutomations()

const page = await context.newPage()
const browserErrors = []
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text())
})
page.on("pageerror", (error) => browserErrors.push(error.message))

const response = await page.goto(`${baseUrl}/app?view=automations`, {
  waitUntil: "domcontentloaded",
  timeout: 120_000,
})
if (!response?.ok())
  throw new Error(`Automations returned ${response?.status()}`)

await page
  .getByRole("heading", { name: "Automations", exact: true })
  .waitFor({ timeout: 120_000 })
await page.getByText("Astrology Informational", { exact: true }).waitFor({
  timeout: 120_000,
})
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
await page.waitForTimeout(500)

await capture("main-page.png")

await page.getByRole("button", { name: "New automation", exact: true }).click()
await page.getByText("Automation templates", { exact: true }).waitFor()
await capture("main-page-new-automation.png")
await page.getByRole("button", { name: "Close templates" }).click()

const slideshowCard = page
  .locator("article")
  .filter({ hasText: "Astrology Informational" })
await slideshowCard.getByRole("button", { name: "Edit", exact: true }).click()
await page.getByRole("button", { name: "Back to automations" }).waitFor()
await capture("editor-overview.png")

await page
  .getByRole("button", { name: "Slideshow Format", exact: true })
  .click()
await page.getByRole("button", { name: "Back", exact: true }).waitFor()
await capture("editor-format.png")
await page.getByRole("button", { name: "Back", exact: true }).click()

await page.getByRole("button", { name: /Hooks \(\d+\) & Style/ }).click()
await capture("editor-hooks-style.png")

await page.getByRole("button", { name: "Schedule", exact: true }).last().click()
await capture("editor-schedule.png")

await page
  .getByRole("button", { name: "Social Media Settings", exact: true })
  .click()
await capture("editor-social-media.png")

await page.getByRole("button", { name: "Settings", exact: true }).last().click()
await capture("editor-settings.png")

await page.getByRole("button", { name: "Back to automations" }).click()
await page.getByRole("heading", { name: "Automations", exact: true }).waitFor()

const videoCard = page
  .locator("article")
  .filter({ hasText: "Astrology React & Reveal" })
await videoCard.getByRole("button", { name: "Edit", exact: true }).click()
await page.getByRole("button", { name: "Video Format", exact: true }).waitFor()
await capture("video-editor-overview.png")
await page.getByRole("button", { name: "Video Format", exact: true }).click()
await page.getByRole("button", { name: "Back", exact: true }).waitFor()
await capture("video-editor-format.png")
await page.getByRole("button", { name: "Back", exact: true }).click()
await page.getByRole("button", { name: "Back to automations" }).click()
await page.getByRole("heading", { name: "Automations", exact: true }).waitFor()

const socialCard = page.locator("article").filter({ hasText: "Astrology X" })
await socialCard.getByRole("button", { name: "Edit", exact: true }).click()
await page.getByRole("heading", { name: "Content Engine" }).waitFor()
await page.waitForTimeout(500)
await page
  .locator("main > div > section")
  .first()
  .screenshot({
    path: path.join(outputDir, "social-x-editor.png"),
  })
process.stdout.write("captured social-x-editor.png\n")

const overlay = await page
  .locator(
    "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"
  )
  .count()
const bodyHasContent = await page
  .locator("body")
  .innerText()
  .then((text) => text.trim().length > 0)

await browser.close()

if (overlay || !bodyHasContent || browserErrors.length) {
  throw new Error(
    JSON.stringify(
      {
        overlay,
        bodyHasContent,
        browserErrors: [...new Set(browserErrors)],
      },
      null,
      2
    )
  )
}

async function authenticate() {
  const login = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
  })
  if (login.ok()) return

  const registration = await context.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: { name: "Automation Docs", email, password },
    }
  )
  if (!registration.ok()) {
    throw new Error(
      `Docs account authentication failed (${registration.status()}): ${await registration.text()}`
    )
  }
}

async function seedAutomations() {
  const currentResponse = await context.request.get(
    `${baseUrl}/api/automations`
  )
  if (!currentResponse.ok()) {
    throw new Error(`Could not read automations (${currentResponse.status()})`)
  }
  const current = await currentResponse.json()
  const names = new Set((current.automations ?? []).map((item) => item.name))
  const regular = [
    { name: "Astrology Informational", automationKind: "slideshow" },
    { name: "Daily Study Tips", automationKind: "slideshow" },
    { name: "Astrology React & Reveal", automationKind: "video" },
  ]
  for (const item of regular) {
    if (names.has(item.name)) continue
    const create = await context.request.post(`${baseUrl}/api/automations`, {
      data: item,
    })
    if (!create.ok()) {
      throw new Error(`Could not seed ${item.name}: ${await create.text()}`)
    }
  }

  const socialResponse = await context.request.get(
    `${baseUrl}/api/x-automations`
  )
  if (!socialResponse.ok()) {
    throw new Error(
      `Could not read social automations (${socialResponse.status()})`
    )
  }
  const social = await socialResponse.json()
  const socialNames = new Set(
    (social.automations ?? []).map((item) => item.name)
  )
  for (const item of [
    { name: "Astrology X", platform: "x" },
    { name: "Astrology Threads", platform: "threads" },
  ]) {
    if (socialNames.has(item.name)) continue
    const create = await context.request.post(`${baseUrl}/api/x-automations`, {
      data: item,
    })
    if (!create.ok()) {
      throw new Error(`Could not seed ${item.name}: ${await create.text()}`)
    }
  }
}

async function capture(fileName) {
  await page.waitForTimeout(250)
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: true,
  })
  process.stdout.write(`captured ${fileName}\n`)
}
