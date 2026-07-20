import { existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { chromium } from "@playwright/test"
import { Client, Query, Users } from "node-appwrite"

const root = path.resolve(import.meta.dirname, "..")
const baseUrl = process.env.AUTOMATION_DOCS_URL ?? "http://localhost:3001"
const outputDirectory = path.join(root, "public", "docs", "automations")
const accountEmail = `docs-automation-${Date.now()}@example.com`
const accountPassword = "Documentation2026"
const browserErrors = []

mkdirSync(outputDirectory, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
})

page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text())
})
page.on("pageerror", (error) => browserErrors.push(error.message))

try {
  process.stdout.write("Registering local documentation account...\n")
  const registerResponse = await page.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        name: "Documentation",
        email: accountEmail,
        password: accountPassword,
      },
    }
  )
  if (registerResponse.status() !== 201) {
    throw new Error(
      `Documentation account registration failed (${registerResponse.status()}).`
    )
  }

  process.stdout.write("Opening the workspace...\n")
  const appResponse = await page.goto(`${baseUrl}/app`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  if (!appResponse?.ok()) {
    throw new Error(`The app returned ${appResponse?.status()}.`)
  }

  await page
    .getByText("Start from a proven workflow")
    .waitFor({ timeout: 120_000 })
  process.stdout.write("Opening a slideshow automation...\n")
  await openSlideshowAutomation()
  await page.evaluate(async () => document.fonts.ready)
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

  const editor = page
    .locator(".grid.min-h-svh.overflow-hidden.bg-app-surface")
    .last()
  if ((await editor.count()) !== 1) {
    throw new Error("The automation editor root was not found.")
  }

  process.stdout.write("Capturing editor sections...\n")
  await captureEditor(editor, "overview", "Study Tips")

  await page
    .getByRole("button", { name: "Slideshow Format", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Back", exact: true })
    .waitFor({ timeout: 60_000 })
  await captureEditor(editor, "format")

  await page.getByRole("button", { name: "Back", exact: true }).click()
  await editor.getByRole("button", { name: /Hooks \(\d+\) & Style/ }).click()
  await captureEditor(editor, "hooks-style", "Hooks & Style")

  await editor.getByRole("button", { name: "Schedule", exact: true }).click()
  await captureEditor(editor, "schedule", "Posting times")

  await editor
    .getByRole("button", { name: "Social Media Settings", exact: true })
    .click()
  await captureEditor(editor, "social-media", "Social Media Settings")

  await editor.getByRole("button", { name: "Settings", exact: true }).click()
  await captureEditor(editor, "settings", "Settings")

  const visibleErrorOverlay = await page
    .locator(
      "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"
    )
    .evaluateAll((nodes) =>
      nodes.some((node) => {
        const style = getComputedStyle(node)
        return style.display !== "none" && style.visibility !== "hidden"
      })
    )
  if (visibleErrorOverlay)
    browserErrors.push("A development error overlay appeared.")
  if (browserErrors.length > 0) {
    throw new Error(
      `Browser errors while capturing docs:\n${[...new Set(browserErrors)].join("\n")}`
    )
  }

  process.stdout.write("Captured six automation editor screenshots.\n")
} finally {
  try {
    await deleteDocumentationAutomations()
  } finally {
    await browser.close()
    await deleteLocalDocumentationAccount(accountEmail)
  }
}

async function captureEditor(editor, name, readyText) {
  if (readyText) {
    await page
      .getByRole("heading", { name: readyText, exact: true })
      .waitFor({ timeout: 60_000 })
  }
  await page.waitForTimeout(300)
  await editor.screenshot({
    path: path.join(outputDirectory, `editor-${name}.png`),
  })
}

async function openSlideshowAutomation() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.getByRole("button", { name: "Use" }).first().click()
    try {
      await page
        .getByRole("button", { name: "Overview", exact: true })
        .waitFor({ timeout: 45_000 })
      return
    } catch (error) {
      if (attempt === 3) throw error
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 })
      await page
        .getByText("Start from a proven workflow")
        .waitFor({ timeout: 120_000 })
    }
  }
}

async function deleteDocumentationAutomations() {
  const response = await page.request.get(`${baseUrl}/api/automations`)
  if (!response.ok()) {
    throw new Error(
      `Failed to list documentation automations during cleanup (${response.status()}).`
    )
  }
  const payload = await response.json()
  const records = Array.isArray(payload.records) ? payload.records : []
  for (const record of records) {
    if (!record || typeof record.id !== "string") continue
    const deleteResponse = await page.request.delete(
      `${baseUrl}/api/automations/${encodeURIComponent(record.id)}`
    )
    if (!deleteResponse.ok()) {
      throw new Error(
        `Failed to delete documentation automation ${record.id} (${deleteResponse.status()}).`
      )
    }
  }
}

async function deleteLocalDocumentationAccount(email) {
  const environment = readEnvironment()
  if (
    environment.APPWRITE_ENDPOINT !== "http://localhost:9080/v1" ||
    environment.APPWRITE_PROJECT_ID !== "cfarm-local" ||
    !environment.APPWRITE_API_KEY
  ) {
    throw new Error(
      "Refusing to clean up the documentation account outside local Appwrite."
    )
  }

  const client = new Client()
    .setEndpoint(environment.APPWRITE_ENDPOINT)
    .setProject(environment.APPWRITE_PROJECT_ID)
    .setKey(environment.APPWRITE_API_KEY)
  const users = new Users(client)
  const matches = await users.list({ queries: [Query.equal("email", [email])] })
  await Promise.all(matches.users.map((user) => users.delete(user.$id)))
}

function readEnvironment() {
  return [".env", ".env.local"].reduce((environment, filename) => {
    const filePath = path.join(root, filename)
    if (!existsSync(filePath)) return environment
    return { ...environment, ...parseEnv(readFileSync(filePath, "utf8")) }
  }, {})
}
