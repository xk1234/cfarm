import JSZip from "jszip"

import {
  SEED_RENDER_TITLE,
  expect,
  expectImageHasContent,
  mainHeading,
  open,
  pngBuffer,
  seed,
  test,
  type SeedResult,
} from "./support"

// Signed-in journeys against the local e2e seam (lib/e2e-auth.ts): memory
// repositories, no Clerk, no SocialBu/Pexels/Apify.

let seeded: SeedResult

test.beforeAll(async ({ request }) => {
  seeded = await seed(request)
})

const sidebar = (page: import("@playwright/test").Page) => page.locator("aside")

test.describe("workspace shell", () => {
  test("renders list shows the seeded render with its cover", async ({ page }) => {
    await open(page, "/app")
    await expect(mainHeading(page, "Renders")).toBeVisible()
    const card = page.getByRole("button", { name: new RegExp(SEED_RENDER_TITLE) })
    await expect(card).toBeVisible()
    await expectImageHasContent(card.locator("img"))
    await expect(card.getByText("Ready")).toBeVisible()
  })

  test("every sidebar item and the docs link work without a reload", async ({ page }) => {
    await open(page, "/app")
    await expect(mainHeading(page, "Renders")).toBeVisible()
    const nav = sidebar(page)
    const views: [string, RegExp, string][] = [
      ["New render", /\/app\/new$/, "New render"],
      ["Batches", /\/app\/batches$/, "Batches"],
      ["Schedule", /\/app\?view=schedule$/, "Schedule"],
      ["Collections", /\/app\/collections$/, "Collections"],
      ["Renders", /\/app$/, "Renders"],
    ]
    for (const [label, url, heading] of views) {
      await nav.getByRole("link", { name: label, exact: true }).click()
      await expect(page).toHaveURL(url)
      await expect(mainHeading(page, heading)).toBeVisible()
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page")
      // The shell never falls back to the route loading skeleton.
      await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0)
    }

    // Back/forward restore the view from the URL.
    await page.goBack()
    await expect(mainHeading(page, "Collections")).toBeVisible()
    await page.goForward()
    await expect(mainHeading(page, "Renders")).toBeVisible()

    await expect(nav.getByRole("img", { name: /Signed in as/ })).toBeVisible()
    const docs = nav.getByRole("link", { name: "Documentation" })
    await expect(docs).toHaveAttribute("href", "/docs")
    await docs.click()
    await expect(page).toHaveURL(/\/docs/, { timeout: 60_000 })
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("deep links open the right view", async ({ page }) => {
    await open(page, `/app/renders/${seeded.renderId}`)
    await expect(mainHeading(page, SEED_RENDER_TITLE)).toBeVisible()
    await open(page, "/app?view=schedule")
    await expect(mainHeading(page, "Schedule")).toBeVisible()
    await open(page, `/app/collections/${seeded.collections[0].name.toLowerCase()}`)
    await expect(mainHeading(page, seeded.collections[0].name)).toBeVisible()
  })

  test("auth pages redirect a signed-in user into the app", async ({ page }) => {
    await open(page, "/login")
    await expect(page).toHaveURL(/\/app$/)
    await expect(mainHeading(page, "Renders")).toBeVisible()
  })
})

test.describe("new render: paste JSON", () => {
  test.use({ allowHttpErrors: [] })

  test("invalid JSON and invalid specs show inline errors with paths", async ({ page }) => {
    await open(page, "/app/new")
    await page.getByRole("tab", { name: "Paste JSON" }).click()
    const input = page.getByRole("textbox", { name: "Spec JSON" })
    await input.fill('{"version": 1, "canvas": ')
    await expect(page.getByRole("alert").filter({ hasText: "Invalid JSON" })).toContainText(/line 1, column/)
    await expect(page.getByRole("button", { name: "Render" })).toBeDisabled()

    await input.fill(
      JSON.stringify({
        version: 1,
        canvas: { preset: "9:16" },
        slides: [{ id: "a", layers: [{ id: "t", type: "text", frame: { inset: 0 } }] }],
      })
    )
    const issues = page.getByRole("alert").filter({ hasText: /error/ })
    await expect(issues).toBeVisible()
    await expect(issues).toContainText("/slides/0/layers/0")
    await expect(page.getByRole("button", { name: "Render" })).toBeDisabled()
  })

  test("a valid spec previews, renders and opens the detail page", async ({ page }) => {
    await open(page, "/app/new")
    await page.getByRole("tab", { name: "Paste JSON" }).click()
    const spec = {
      version: 1,
      name: "Pasted e2e render",
      canvas: { preset: "4:5", background: "#1e293b" },
      slides: [
        {
          id: "one",
          layers: [
            {
              id: "photo",
              type: "image",
              src: { media: seeded.collections[1].mediaIds[0] },
              frame: { x: "50%", y: "40%", width: "70%", height: "50%", anchor: "center" },
              fit: "cover",
            },
            {
              id: "title",
              type: "text",
              text: "Pasted slide",
              frame: { x: "50%", y: "85%", width: "90%", anchor: "center" },
              style: { fontFamily: "Inter", fontWeight: 800, fontSize: 64, color: "#ffffff", align: "center" },
            },
          ],
        },
        {
          id: "two",
          layers: [
            {
              id: "title",
              type: "text",
              text: "Second slide",
              frame: { inset: 80 },
              style: { fontFamily: "Inter", fontWeight: 800, fontSize: 72, color: "#fde68a", align: "center" },
            },
          ],
        },
      ],
    }
    await page.getByRole("textbox", { name: "Spec JSON" }).fill(JSON.stringify(spec, null, 2))
    await expect(page.getByText("Valid spec. Ready to render.")).toBeVisible()

    const preview = page.getByLabel("Spec preview")
    await expect(preview.getByRole("img")).toHaveCount(2)
    await expectImageHasContent(preview.getByRole("img", { name: "Slide 1" }))

    const render = page.getByRole("button", { name: "Render", exact: true })
    await expect(render).toBeEnabled()
    await render.click()
    await expect(page).toHaveURL(/\/app\/renders\/[a-z0-9]+$/)
    await expect(mainHeading(page, "Pasted e2e render")).toBeVisible()
    const slides = page.getByRole("list", { name: "Slides" }).locator("img")
    await expect(slides).toHaveCount(2)
    for (const slide of await slides.all()) await expectImageHasContent(slide)
  })
})

test.describe("new render: starter template", () => {
  test("fills image slots from a collection pick and a random pick, then renders", async ({ page }) => {
    await open(page, "/app/new")
    await page.getByRole("button", { name: /Photo \+ outline caption/ }).click()
    await expect(mainHeading(page, "Photo + outline caption")).toBeVisible()

    // Slide 1: a specific image from the Sunsets collection.
    await page.getByRole("button", { name: "Photo: choose image" }).first().click()
    const picker = page.getByRole("dialog", { name: "Photo" })
    await picker.getByRole("tab", { name: "Collections" }).click()
    await picker.getByRole("button", { name: /Sunsets · 3/ }).click()
    await picker.getByRole("button", { name: /sunsets-1\.png/ }).first().click()
    await expect(picker).toBeHidden()
    await page.getByLabel("Caption").first().fill("First caption")

    // Slide 2: random from the Textures collection.
    await page.getByRole("button", { name: "Add item" }).click()
    await page.getByRole("button", { name: "Photo: choose image" }).click()
    await picker.getByRole("tab", { name: "Collections" }).click()
    await picker.getByRole("button", { name: /Textures · 3/ }).click()
    await picker.getByRole("button", { name: "Random from collection" }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole("button", { name: "Photo: Random from collection" })).toBeVisible()
    await page.getByLabel("Caption").nth(1).fill("Second caption")

    // Live browser preview paints both slides.
    const preview = page.getByLabel("Live preview")
    await expect(preview.getByRole("img")).toHaveCount(2)
    for (const slide of await preview.getByRole("img").all()) await expectImageHasContent(slide)

    await page.getByRole("button", { name: "Render", exact: true }).click()
    await expect(page).toHaveURL(/\/app\/renders\/[a-z0-9]+$/)
    const slides = page.getByRole("list", { name: "Slides" }).locator("img")
    await expect(slides).toHaveCount(2)
    for (const slide of await slides.all()) await expectImageHasContent(slide)
  })
})

test.describe("render detail", () => {
  test("gallery, ZIP download, copy spec and publish without SocialBu", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await open(page, `/app/renders/${seeded.renderId}`)
    await expect(mainHeading(page, SEED_RENDER_TITLE)).toBeVisible()

    const strip = page.getByRole("list", { name: "Slides" })
    await expect(strip.locator("img")).toHaveCount(2)
    await page.getByRole("button", { name: "Slide 2" }).click()
    await expect(page.getByRole("button", { name: "Slide 2" })).toHaveAttribute("aria-current", "true")
    await page.getByRole("button", { name: "Previous slide" }).click()
    await expect(page.getByRole("button", { name: "Slide 1" })).toHaveAttribute("aria-current", "true")
    await expectImageHasContent(page.getByRole("img", { name: "Slide 1 (seed-1)" }))

    const download = page.waitForEvent("download")
    await page.getByRole("link", { name: "Download ZIP" }).click()
    const file = await download
    const zip = await JSZip.loadAsync(await readDownload(file))
    expect(Object.keys(zip.files).filter((name) => name.endsWith(".png"))).toHaveLength(2)

    await page.getByRole("button", { name: "Copy spec JSON" }).click()
    await expect(page.getByText("Spec JSON copied")).toBeVisible()
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
    expect(copied).toMatchObject({ version: 1, slides: [{ id: "seed-1" }, { id: "seed-2" }] })

    await page.getByRole("button", { name: "Publish" }).click()
    const dialog = page.getByRole("dialog", { name: "Publish" })
    await expect(dialog.getByText("SocialBu not connected")).toBeVisible()
    await dialog.getByRole("button", { name: "Open settings" }).click()
    const settings = page.getByRole("dialog", { name: "Settings" })
    await expect(settings.getByRole("tab", { name: "SocialBu" })).toHaveAttribute("aria-selected", "true")
    await expect(settings.getByText("SocialBu not connected")).toBeVisible()
  })
})

async function readDownload(download: import("@playwright/test").Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const bytes = Buffer.concat(chunks)
  expect(bytes.subarray(0, 2).toString()).toBe("PK")
  return bytes
}

test.describe("schedule", () => {
  test("calendar pages between months", async ({ page }) => {
    await open(page, "/app?view=schedule")
    await expect(mainHeading(page, "Schedule")).toBeVisible()
    const now = new Date()
    const label = (date: Date) => date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Next month" }).click()
    await expect(page.getByText(label(new Date(now.getFullYear(), now.getMonth() + 1, 1)), { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Previous month" }).click()
    await page.getByRole("button", { name: "Previous month" }).click()
    await expect(page.getByText(label(new Date(now.getFullYear(), now.getMonth() - 1, 1)), { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Today" }).click()
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()
  })
})

test.describe("collections", () => {
  test("create, rename, upload into, and delete a collection", async ({ page }) => {
    await open(page, "/app/collections")
    await expect(mainHeading(page, "Collections")).toBeVisible()
    await expect(page.getByRole("button", { name: "Open Sunsets" })).toBeVisible()

    await page.getByRole("button", { name: "New collection" }).click()
    const card = page.getByRole("button", { name: /^Open Untitled collection/ }).first()
    await expect(card).toBeVisible()
    const draftName = (await card.getAttribute("aria-label"))!.replace(/^Open /, "")
    await card.click()
    await expect(mainHeading(page, draftName)).toBeVisible()

    // Rename updates the saved row (no duplicate) and the URL.
    const name = `E2E album ${Date.now().toString(36)}`
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await page.getByRole("textbox", { name: "Collection name" }).fill(name)
    await page.getByRole("textbox", { name: "Collection name" }).press("Enter")
    await expect(mainHeading(page, name)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/app/collections/${name.toLowerCase().replace(/ /g, "-")}$`))

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "upload-e2e.png",
      mimeType: "image/png",
      buffer: await pngBuffer(page, "#16a34a"),
    })
    await expect(page.getByText("Uploaded 1 image")).toBeVisible()
    await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(1)

    // The upload survives a reload (it was persisted, not just shown).
    await page.reload({ waitUntil: "networkidle" })
    await expect(mainHeading(page, name)).toBeVisible()
    await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(1)

    await page.getByRole("button", { name: "Back to collections" }).click()
    await expect(mainHeading(page, "Collections")).toBeVisible()
    await page.getByRole("button", { name: `Delete ${name}` }).click()
    const confirm = page.getByRole("dialog", { name: "Delete collections" })
    await expect(confirm).toContainText("1 media item")
    await confirm.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("button", { name: `Open ${name}` })).toHaveCount(0)

    await page.reload({ waitUntil: "networkidle" })
    await expect(page.getByRole("button", { name: "Open Sunsets" })).toBeVisible()
    await expect(page.getByRole("button", { name: `Open ${name}` })).toHaveCount(0)
    await expect(page.getByRole("button", { name: `Open ${draftName}` })).toHaveCount(0)
  })

  test("two new collections stay separate after a reload", async ({ page }) => {
    await open(page, "/app/collections")
    await expect(page.getByRole("button", { name: "Open Sunsets" })).toBeVisible()
    const before = await page.getByRole("button", { name: /^Open Untitled collection/ }).count()
    await page.getByRole("button", { name: "New collection" }).click()
    await expect(page.getByRole("button", { name: /^Open Untitled collection/ })).toHaveCount(before + 1)
    await page.getByRole("button", { name: "New collection" }).click()
    await expect(page.getByRole("button", { name: /^Open Untitled collection/ })).toHaveCount(before + 2)
    await page.reload({ waitUntil: "networkidle" })
    await expect(page.getByRole("button", { name: /^Open Untitled collection/ })).toHaveCount(before + 2)
  })
})

test.describe("settings", () => {
  test("API keys are shown once and can be revoked; MCP, reminders and SocialBu tabs work", async ({ page, context }) => {
    const keyName = `E2E script ${Date.now().toString(36)}`
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await open(page, "/app")
    await sidebar(page).getByRole("button", { name: "Settings" }).click()
    const settings = page.getByRole("dialog", { name: "Settings" })
    await expect(settings.getByRole("tab", { name: "API keys" })).toHaveAttribute("aria-selected", "true")

    await settings.getByLabel("Key name").fill(keyName)
    await settings.getByRole("button", { name: "Create key" }).click()
    const shown = settings.getByText(/^lc_[A-Za-z0-9_]+$/)
    await expect(shown).toBeVisible()
    const plaintext = (await shown.textContent())!.trim()
    await settings.getByRole("button", { name: "Copy API key" }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(plaintext)

    // The key works against the public API.
    const api = await page.request.get("/api/v1/renders?limit=1", {
      headers: { authorization: `Bearer ${plaintext}` },
    })
    expect(api.status()).toBe(200)

    await settings.getByRole("button", { name: "Done" }).click()
    await expect(settings.getByText(plaintext)).toHaveCount(0)
    await expect(settings.getByText(keyName, { exact: true })).toBeVisible()

    await settings.getByRole("button", { name: `Revoke ${keyName}` }).click()
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" && response.url().includes("/api/settings/api-keys/")
    )
    await page.getByRole("alertdialog", { name: /Revoke/ }).getByRole("button", { name: "Revoke key" }).click()
    expect((await deleted).status()).toBe(204)
    await expect(settings.getByText(keyName, { exact: true })).toHaveCount(0)
    await expect(settings).toBeVisible()
    const revoked = await page.request.get("/api/v1/renders?limit=1", {
      headers: { authorization: `Bearer ${plaintext}` },
    })
    expect(revoked.status(), await revoked.text()).toBe(401)

    await settings.getByRole("tab", { name: "MCP" }).click()
    await expect(settings.getByText("lumenclip_slideshow_render")).toBeVisible()

    await settings.getByRole("tab", { name: "SocialBu" }).click()
    await expect(settings.getByText("SocialBu not connected")).toBeVisible()

    await settings.getByRole("tab", { name: "Reminders" }).click()
    await settings.getByRole("radio", { name: "None" }).check()
    await settings.getByRole("button", { name: "Save" }).click()
    await expect(settings.getByText("Reminder settings saved.")).toBeVisible()
    await settings.getByRole("radio", { name: "In-app" }).check()
    await settings.getByRole("button", { name: "Save" }).click()
    await expect(settings.getByText("Reminder settings saved.")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(settings).toBeHidden()
  })
})

test.describe("notifications", () => {
  test("a finished render lands in the inbox and opens the render", async ({ page }) => {
    await open(page, "/app")
    await expect(mainHeading(page, "Renders")).toBeVisible()
    const title = `Inbox render ${Date.now().toString(36)}`
    const created = await page.request.post("/api/renders", {
      data: {
        title,
        spec: {
          version: 1,
          canvas: { preset: "1:1", background: "#7c3aed" },
          slides: [
            {
              id: "only",
              layers: [
                {
                  id: "t",
                  type: "text",
                  text: "Inbox",
                  frame: { inset: 40 },
                  style: { fontFamily: "Inter", fontWeight: 800, fontSize: 96, color: "#ffffff", align: "center" },
                },
              ],
            },
          ],
        },
      },
    })
    expect(created.status()).toBe(201)
    const { render: { id } } = (await created.json()) as { render: { id: string } }

    await page.reload({ waitUntil: "networkidle" })
    const bell = sidebar(page).getByRole("button", { name: /^Notifications \(\d+ unread\)$/ })
    await expect(bell).toBeVisible()
    await bell.click()
    const item = page.getByRole("button", { name: new RegExp(`^${title} rendered`) })
    await expect(item).toBeVisible()
    await item.click()
    await expect(page).toHaveURL(new RegExp(`/app/renders/${id}$`))
    await expect(mainHeading(page, title)).toBeVisible()

    await sidebar(page).getByRole("button", { name: /^Notifications/ }).click()
    await page.getByRole("button", { name: "Mark all read" }).click()
    await expect(sidebar(page).getByRole("button", { name: "Notifications", exact: true })).toBeVisible()
  })
})
