import { existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { chromium } from "@playwright/test"
import { Client, Query, Users } from "node-appwrite"

const root = path.resolve(import.meta.dirname, "..")
const baseUrl = process.env.AUTOMATION_DOCS_URL ?? "http://localhost:3000"
const outputDirectory = path.join(root, "public", "docs", "automations")
const accountEmail = `docs-hooks-${Date.now()}@example.com`
const accountPassword = "Documentation2026"

mkdirSync(outputDirectory, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
const browserErrors = []
let automationId = ""

page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text())
})
page.on("pageerror", (error) => browserErrors.push(error.message))

try {
  const registration = await context.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        name: "Hook documentation",
        email: accountEmail,
        password: accountPassword,
      },
    }
  )
  if (registration.status() !== 201) {
    throw new Error(
      `Documentation account registration failed (${registration.status()}).`
    )
  }

  await page.goto(`${baseUrl}/app`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  await page.getByText("Start from a proven workflow").waitFor({
    timeout: 120_000,
  })
  await page.getByRole("button", { name: "Use" }).first().click()
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .waitFor({ timeout: 60_000 })

  const automationsResponse = await context.request.get(
    `${baseUrl}/api/automations`
  )
  if (!automationsResponse.ok()) {
    throw new Error(
      `Failed to load the documentation automation (${automationsResponse.status()}).`
    )
  }
  const automations = await automationsResponse.json()
  const record = automations.records?.[0]
  if (!record?.id || !Array.isArray(record.schema?.hooks)) {
    throw new Error(
      "The documentation automation did not expose a hook catalog."
    )
  }
  automationId = record.id
  const createdAt = new Date().toISOString()
  const sourceHooks = record.schema.hooks.slice(0, 3)
  const hooks = [
    {
      ...(sourceHooks[0] ?? {}),
      id: "hook_focus_reset",
      text: "the 10-minute study reset nobody teaches",
      enabled: true,
      createdAt,
    },
    {
      ...(sourceHooks[1] ?? {}),
      id: "hook_revision_mistakes",
      text: "3 revision mistakes that quietly lower your grade",
      enabled: true,
      createdAt,
    },
    {
      ...(sourceHooks[2] ?? {}),
      id: "hook_exam_week",
      text: "what top students stop doing during exam week",
      enabled: false,
      createdAt,
    },
  ]
  const schema = {
    ...record.schema,
    title: "Hook Performance Demo",
    hooks,
    prompt_formatting: {
      ...record.schema.prompt_formatting,
      narrative: hooks.map((hook) => hook.text).join("\n"),
    },
  }
  const patchResponse = await context.request.patch(
    `${baseUrl}/api/automations`,
    { data: { id: automationId, name: "Hook Performance Demo", schema } }
  )
  if (!patchResponse.ok()) {
    throw new Error(
      `Failed to prepare hook documentation data (${patchResponse.status()}).`
    )
  }

  const analytics = {
    automationId,
    hooks: [
      {
        hookId: hooks[0].id,
        used: true,
        publishedPosts: 4,
        lastPublishedAt: "2026-07-17T12:00:00.000Z",
      },
      { hookId: hooks[1].id, used: false, publishedPosts: 0 },
      { hookId: hooks[2].id, used: false, publishedPosts: 0 },
    ],
    rows: [
      {
        hookId: hooks[0].id,
        text: hooks[0].text,
        enabled: true,
        publishedPosts: 4,
        lastPublishedAt: "2026-07-17T12:00:00.000Z",
        providers: ["instagram", "tiktok"],
        metrics: {
          views: 128_400,
          likes: 9_400,
          comments: 381,
          shares: 1_220,
          saves: 3_140,
          interactions: 14_141,
          engagementRate: 11.01,
        },
      },
    ],
  }
  await page.route(
    `**/api/automations/${automationId}/hook-analytics`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(analytics),
      })
  )

  await page.goto(`${baseUrl}/app?view=automations`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  const card = page
    .locator("article")
    .filter({ hasText: "Hook Performance Demo" })
  await card.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = page
    .locator(".grid.min-h-svh.overflow-hidden.bg-app-surface")
    .last()
  await editor.getByRole("button", { name: /Hooks \(3\) & Style/ }).click()
  await page
    .getByRole("heading", { name: "Hooks & Style", exact: true })
    .waitFor()
  await page.locator('input[aria-label="Hook 1"]').waitFor()
  if (!(await page.locator('input[aria-label="Hook 1"]').isDisabled())) {
    throw new Error("The published hook was not locked in the editor.")
  }
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseUrl,
  })
  await editor.getByRole("button", { name: "Copy all hooks" }).click()
  const copiedHooks = await page.evaluate(() => navigator.clipboard.readText())
  if (copiedHooks !== hooks.map((hook) => hook.text).join("\n")) {
    throw new Error("The copy-all button did not preserve the hook catalog.")
  }

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
  await page.waitForTimeout(300)
  await editor.screenshot({
    path: path.join(outputDirectory, "hook-catalog-editor.png"),
  })

  await editor.getByRole("button", { name: "Analytics", exact: true }).click()
  await page
    .getByRole("heading", { name: "Hook analytics", exact: true })
    .waitFor()
  await page.getByText("128.4K", { exact: true }).waitFor()
  await page.waitForTimeout(300)
  await editor.screenshot({
    path: path.join(outputDirectory, "hook-analytics.png"),
  })

  const overlay = await page.locator("[data-nextjs-dialog]").count()
  if (overlay || browserErrors.length > 0) {
    throw new Error(
      `Browser verification failed: ${JSON.stringify({ overlay, browserErrors })}`
    )
  }
  process.stdout.write(
    "Captured hook-catalog-editor.png and hook-analytics.png.\n"
  )
} finally {
  if (automationId) {
    await context.request.delete(
      `${baseUrl}/api/automations/${encodeURIComponent(automationId)}`
    )
  }
  await browser.close()
  await deleteLocalDocumentationAccount(accountEmail)
}

async function deleteLocalDocumentationAccount(email) {
  const environment = [".env", ".env.local"].reduce((values, filename) => {
    const filePath = path.join(root, filename)
    if (!existsSync(filePath)) return values
    return { ...values, ...parseEnv(readFileSync(filePath, "utf8")) }
  }, {})
  if (
    environment.APPWRITE_ENDPOINT !== "http://localhost:9080/v1" ||
    environment.APPWRITE_PROJECT_ID !== "cfarm-local" ||
    !environment.APPWRITE_API_KEY
  ) {
    throw new Error(
      "Refusing to clean up the docs account outside local Appwrite."
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
