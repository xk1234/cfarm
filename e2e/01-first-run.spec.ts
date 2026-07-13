import { test, expect, gotoView } from "./fixtures"

// Journey 1 — First run: create a character and generate content.
test.describe("Journey 1 — first run", () => {
  test("create a character, generate images, edit from a source", async ({ page, state }) => {
    await page.goto("/")

    await test.step("open AI UGC avatars (empty state)", async () => {
      await gotoView(page, "AI UGC avatars")
      await expect(page.getByText(/No characters yet/i)).toBeVisible()
    })

    await test.step("create a character", async () => {
      await page.getByRole("button", { name: /New Character/i }).click()
      // TODO(selector): confirm the create modal's name field label/placeholder.
      await page.getByLabel(/name/i).first().fill("Maya")
      await page.getByRole("button", { name: /Save|Create/i }).click()
      // Character now exists (stub pushed it into state) and the composer renders.
      await expect.poll(() => state.characters.length).toBe(1)
      await expect(page.getByLabel("Edit AI UGC character prompt")).toBeVisible()
    })

    await test.step("generate an image", async () => {
      await page.getByLabel("Edit AI UGC character prompt").fill("mirror selfie in a cafe")
      await page.getByRole("button", { name: "Generate", exact: true }).click()
      // The generation appears in the grid.
      await expect.poll(() => state.generations.length).toBeGreaterThanOrEqual(1)
      // TODO(selector): assert a generation card/image is visible in the grid,
      // e.g. add data-testid="generation-card" and use page.getByTestId.
    })

    await test.step("use a result as source and edit from it", async () => {
      // TODO(selector): click a generation card's "Use as source image" control
      // (aria-label="Use as source image" exists), then Generate again.
      await page.getByRole("button", { name: /Use as source image/i }).first().click()
      await page.getByRole("button", { name: "Close modal", exact: true }).click()
      await page.getByLabel("Edit AI UGC character prompt").fill("same character, add sunglasses")
      await page.getByRole("button", { name: "Generate", exact: true }).click()
      await expect.poll(() => state.generations.length).toBeGreaterThanOrEqual(2)
    })

    await test.step("persistence: reload keeps the character", async () => {
      await page.reload()
      await gotoView(page, "AI UGC avatars")
      await expect(page.getByLabel("Edit AI UGC character prompt")).toBeVisible()
    })
  })
})
