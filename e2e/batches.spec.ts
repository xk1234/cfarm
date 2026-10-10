import {
  expect,
  expectImageHasContent,
  mainHeading,
  open,
  seed,
  test,
} from "./support"

// Batch journey against the local e2e seam: memory repositories, inline job
// draining (LUMENCLIP_INLINE_JOBS=1) and no SocialBu token, so items render
// and then fail at the scheduling step with a clear message.

test.beforeAll(async ({ request }) => {
  await seed(request)
})

function inDays(days: number) {
  const date = new Date(Date.now() + days * 86_400_000)
  return date.toISOString().slice(0, 10)
}

const items = (captions: string[]) =>
  JSON.stringify(
    captions.map((caption, index) => ({
      slotValues: {
        slides: [
          {
            image: { collection: "Sunsets", pick: "random" },
            caption: `${caption} slide 1`,
          },
          {
            image: { collection: "Textures", pick: "random" },
            caption: `${caption} slide 2`,
          },
        ],
      },
      caption: `${caption} #batch${index + 1}`,
    })),
    null,
    2
  )

async function fillNewBatch(
  page: import("@playwright/test").Page,
  itemsText: string
) {
  await page
    .getByRole("combobox", { name: "Template" })
    .selectOption({ label: "Photo + pill captions" })
  await page
    .getByRole("textbox", { name: "Items (JSON or CSV)" })
    .fill(itemsText)
  await page.getByRole("textbox", { name: "Account IDs" }).fill("101")
  await page.getByRole("textbox", { name: "Timezone" }).fill("UTC")
  await page.getByLabel("Start date").fill(inDays(2))
  await page.getByRole("textbox", { name: "Times of day" }).fill("09:00, 18:00")
}

test("preview → create → items render → scheduling fails clearly without SocialBu", async ({
  page,
}) => {
  await open(page, "/app/batches")
  await expect(mainHeading(page, "Batches")).toBeVisible()
  await page.getByRole("button", { name: "New batch" }).click()
  await expect(page).toHaveURL(/\/app\/batches\/new$/)
  await expect(mainHeading(page, "New batch")).toBeVisible()

  await page.getByRole("textbox", { name: "Name" }).fill("E2E batch")
  await fillNewBatch(page, items(["Morning", "Evening"]))
  const create = page.getByRole("button", { name: "Create batch" })
  await expect(create).toBeDisabled()

  await page.getByRole("button", { name: "Preview" }).click()
  const preview = page.getByRole("region", { name: "Preview" })
  await expect(preview.getByText("2 items ready")).toBeVisible()
  await expect(preview.getByRole("status")).toContainText(
    "SocialBu not connected"
  )
  const rows = preview.getByRole("row")
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText(`${inDays(2)} 09:`)
  await expect(rows.nth(2)).toContainText(`${inDays(2)} 18:`)
  await expect(rows.nth(1)).toContainText("OK")

  await expect(create).toBeEnabled()
  await create.click()
  await expect(page).toHaveURL(/\/app\/batches\/[^/]+$/, { timeout: 30_000 })
  await expect(mainHeading(page, "E2E batch")).toBeVisible()

  // Both items render (thumbnails of real slides), then fail at the SocialBu step.
  const item = (n: number) => page.getByRole("article", { name: `Item ${n}` })
  for (const n of [1, 2]) {
    await expect(item(n).getByText("Failed", { exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(item(n).getByRole("alert")).toContainText(
      "SocialBu not connected"
    )
    await expect(item(n).getByRole("alert")).toContainText("retry the batch")
    const thumbnails = item(n).getByRole("img")
    await expect(thumbnails).toHaveCount(2)
    await expectImageHasContent(thumbnails.first())
  }
  await expect(
    page
      .getByRole("heading", { level: 1 })
      .locator("..")
      .getByText("Failed", { exact: true })
  ).toBeVisible()
  await expect(page.getByText(/2 failed of 2 items/)).toBeVisible()

  // Retrying while SocialBu is still missing changes nothing and says why.
  await page.getByRole("button", { name: "Retry failed" }).click()
  await expect(page.getByText(/SocialBu not connected/).last()).toBeVisible()

  // The item's render opens as a normal render.
  await item(1).getByRole("button", { name: "Open render" }).click()
  await expect(page).toHaveURL(/\/app\/renders\//)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "E2E batch"
  )

  // The calendar shows the batch's posts on their slot day.
  await open(page, "/app?view=schedule")
  await expect(mainHeading(page, "Schedule")).toBeVisible()
  if (new Date(`${inDays(2)}T12:00:00`).getMonth() !== new Date().getMonth()) {
    await page.getByRole("button", { name: "Next month" }).click()
  }
  await expect(
    page
      .getByText(/E2E batch · 1 · Batch · Failed/)
      .filter({ visible: true })
      .first()
  ).toBeVisible()

  // The list shows the finished batch.
  await open(page, "/app/batches")
  const row = page.getByRole("button", { name: /E2E batch/ })
  await expect(row).toBeVisible()
  await expect(row.getByText("Failed", { exact: true })).toBeVisible()
})

test("preview lists per-item errors and blocks creation", async ({ page }) => {
  await open(page, "/app/batches/new")
  await expect(mainHeading(page, "New batch")).toBeVisible()
  const bad = JSON.stringify([
    {
      slotValues: {
        slides: [
          { image: { collection: "Sunsets", pick: "random" }, caption: "Fine" },
        ],
      },
      caption: "ok",
    },
    { slotValues: { slides: [] }, caption: "empty" },
  ])
  await fillNewBatch(page, bad)
  await page.getByRole("button", { name: "Preview" }).click()
  const preview = page.getByRole("region", { name: "Preview" })
  await expect(preview.getByText(/1 error/)).toBeVisible()
  await expect(preview.getByRole("row").nth(2)).toContainText(
    "/items/1/slotValues/slides"
  )
  await expect(
    page.getByRole("button", { name: "Create batch" })
  ).toBeDisabled()
})
