import { test, expect, gotoView } from "./fixtures"

// Journey 5 — Produce and (optionally) schedule a greenscreen meme video.
test.describe("Journey 5 — greenscreen meme", () => {
  test("generate a greenscreen video and open scheduling", async ({ page, state }) => {
    await page.goto("/")

    await test.step("open Greenscreen Memes", async () => {
      await gotoView(page, "Greenscreen Memes")
      // TODO(selector): assert the greenscreen configurator renders (heading/controls).
    })

    await test.step("configure and generate", async () => {
      // TODO(selector): fill the meme config (background, hook text via the
      // "e.g. A bold hook about..." placeholder) and click Generate.
      await page.getByRole("textbox").fill("when the render finally works")
      await page.getByRole("button", { name: "Create", exact: true }).click()
      await expect.poll(() => state.generatedVideos.length).toBe(1)
    })

    await test.step("export is listed and can be scheduled", async () => {
      // TODO(selector): open the exports list; click "Schedule" on an export to
      // open the PostFast scheduling modal.
      await gotoView(page, "Schedule")
      await expect(page.getByText(/Schedule|Calendar/i).first()).toBeVisible()
    })
  })
})
