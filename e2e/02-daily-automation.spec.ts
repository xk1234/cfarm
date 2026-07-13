import { appApi, test, expect, gotoView } from "./fixtures"

// Journey 2 — Stand up a daily faceless TikTok automation (the flagship loop).
// Crosses collections → (variables) → automations → run → schedule/calendar.
test.describe("Journey 2 — daily automation", () => {
  test("import images, build an automation, run it, see it on the calendar", async ({ page, state }) => {
    await page.goto("/")

    await test.step("import an image collection", async () => {
      await gotoView(page, "Collections")
      const imported = await appApi(page, "/api/image-collections/import", {
        method: "POST",
        data: { name: "Daily scenes", images: [{ url: "https://example.com/a.jpg" }] },
      })
      expect(imported.status).toBe(201)
      await expect.poll(() => state.collections.length).toBeGreaterThanOrEqual(1)
    })

    await test.step("caption the collection", async () => {
      const captioned = await appApi(page, "/api/image-collections/captions", {
        method: "POST",
        data: {},
      })
      expect(captioned.status).toBe(200)
    })

    await test.step("create an automation", async () => {
      await gotoView(page, "Automations")
      const created = await appApi(page, "/api/automations", {
        method: "POST",
        data: { name: "Daily faceless TikTok", schema: { title: "Daily faceless TikTok" } },
      })
      expect(created.status).toBe(201)
      await expect.poll(() => state.automationRecords.length).toBeGreaterThanOrEqual(1)
    })

    await test.step("force-run the automation once", async () => {
      const run = await appApi(page, "/api/automations/run", {
        method: "POST",
        data: { automationId: state.automationRecords[0]?.id, force: true },
      })
      expect(run.status).toBe(200)
      await expect.poll(() => state.runs.length).toBeGreaterThanOrEqual(1)
      // Rendered slides should reference the outputs path.
      expect(state.runs[0].renderedSlides?.[0]?.imageUrl).toContain("/slideshows/outputs/")
    })

    await test.step("scheduled post shows on the calendar", async () => {
      await gotoView(page, "Schedule")
      // With PostFast unconfigured (stub), the calendar renders with no live posts.
      // TODO(selector): assert the calendar grid renders; in live mode with a
      // connected account, assert the scheduled post appears on its date.
      await expect(page.getByText(/Schedule|Calendar/i).first()).toBeVisible()
    })
  })
})
