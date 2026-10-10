import {
  SEED_RENDER_TITLE,
  expect,
  expectImageLoaded,
  expectNoHorizontalScroll,
  mainHeading,
  open,
  seed,
  test,
  type SeedResult,
} from "./support"

// AGENTS.md: at 360px keep the region order and avoid page-level horizontal scroll.
test.use({ viewport: { width: 360, height: 780 } })

let seeded: SeedResult

test.beforeAll(async ({ request }) => {
  seeded = await seed(request)
})

test("every workspace view fits 360px without horizontal scroll", async ({ page }) => {
  const views: [string, string][] = [
    ["/app", "Renders"],
    ["/app/new", "New render"],
    ["/app/batches", "Batches"],
    ["/app/batches/new", "New batch"],
    ["/app?view=schedule", "Schedule"],
    ["/app/collections", "Collections"],
    [`/app/collections/${seeded.collections[0].name.toLowerCase()}`, seeded.collections[0].name],
    [`/app/renders/${seeded.renderId}`, SEED_RENDER_TITLE],
  ]
  for (const [path, heading] of views) {
    await open(page, path)
    await expect(mainHeading(page, heading)).toBeVisible()
    await page.waitForLoadState("networkidle")
    await expectNoHorizontalScroll(page)
  }

  // New render: the JSON tab and a template's slot form also fit.
  await open(page, "/app/new")
  await page.getByRole("tab", { name: "Paste JSON" }).click()
  await expect(page.getByRole("textbox", { name: "Spec JSON" })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await page.getByRole("tab", { name: "From template" }).click()
  await page.getByRole("button", { name: /Photo \+ outline caption/ }).click()
  await expect(mainHeading(page, "Photo + outline caption")).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("the mobile menu reaches every view and settings", async ({ page }) => {
  await open(page, "/app")
  await expect(mainHeading(page, "Renders")).toBeVisible()
  const views: [string, string][] = [
    ["New render", "New render"],
    ["Batches", "Batches"],
    ["Schedule", "Schedule"],
    ["Collections", "Collections"],
    ["Renders", "Renders"],
  ]
  const menu = page.getByRole("dialog", { name: "Mobile navigation" })
  // The first tap can land before hydration on a cold dev server.
  const openMenu = () =>
    expect(async () => {
      if (!(await menu.isVisible())) await page.getByRole("button", { name: "Open menu" }).click()
      await expect(menu).toBeVisible({ timeout: 2_000 })
    }).toPass()
  for (const [label, heading] of views) {
    await openMenu()
    await menu.getByRole("link", { name: label, exact: true }).click()
    await expect(menu).toBeHidden()
    await expect(mainHeading(page, heading)).toBeVisible()
    await expectNoHorizontalScroll(page)
  }

  await openMenu()
  await menu.getByRole("button", { name: "Settings" }).click()
  const settings = page.getByRole("dialog", { name: "Settings" })
  await expect(settings).toBeVisible()
  for (const tab of ["API keys", "SocialBu", "MCP", "Reminders"]) {
    await settings.getByRole("tab", { name: tab }).click()
    await expect(settings.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true")
    await expectNoHorizontalScroll(page)
  }
})

test("render detail works at 360px", async ({ page }) => {
  await open(page, `/app/renders/${seeded.renderId}`)
  await expect(mainHeading(page, SEED_RENDER_TITLE)).toBeVisible()
  await expectImageLoaded(page.getByRole("img", { name: "Slide 1 (seed-1)" }))
  for (const action of ["Copy spec JSON", "Publish"]) {
    await expect(page.getByRole("button", { name: action })).toBeInViewport()
  }
  await expect(page.getByRole("link", { name: "Download ZIP" })).toBeInViewport()
  await expectNoHorizontalScroll(page)
})
