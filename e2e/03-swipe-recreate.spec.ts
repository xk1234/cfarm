import { test, expect, gotoView } from "./fixtures"

// Journey 3 — Swipe a winning ad and recreate it.
// The extension capture (step 1) can't be driven from the page; we seed a swipe
// via the API stub instead and test the browse → analyze → recreate path.
test.describe("Journey 3 — swipe and recreate", () => {
  test("browse a saved swipe, read its analysis, recreate with a character", async ({ page, state }) => {
    // Seed a saved video swipe (stands in for an extension capture).
    state.swipes = [
      {
        id: "swipe-1",
        advertiser: "Acme",
        platform: "tiktok",
        source: "tiktok",
        sourceUrl: "https://www.tiktok.com/@acme/video/1",
        title: "Bag ad",
        caption: "Visible caption",
        format: "video",
        mediaUrl: "/api/swipes/assets/swipe-1-media.mp4",
        screenshotPath: "/api/swipes/assets/swipe-1.png",
        swipedAt: new Date().toISOString(),
        processingStatus: "complete",
        full_script_transcription: { full_text: "Real whispered transcript", speakers: [], pause_notes: [], emotional_tone_notes: [] },
        core_ugc_aesthetic_analysis: { social_context_and_scenario: { scenario: "product demo" } },
        metadata: {},
        stats: {},
        folder: "No Folder",
      },
    ]
    state.characters = [
      { id: "char-1", user_id: "test", name: "Maya", attributes: { name: "Maya" }, collection_id: null, created_at: "", updated_at: "", preview_url: "" },
    ]

    await page.goto("/")

    await test.step("open the swipe file", async () => {
      await gotoView(page, "Swipes")
      await expect(page.getByText("Swipe File")).toBeVisible()
      await expect(page.getByText(/Bag ad|Acme/i).first()).toBeVisible()
    })

    await test.step("filter the swipe file", async () => {
      await page.getByPlaceholder(/Search By Brand Name/i).fill("Acme")
      await expect(page.getByText(/Acme|Bag ad/i).first()).toBeVisible()
    })

    await test.step("open the swipe detail and read the analysis", async () => {
      await page.getByRole("button", { name: "Inspect Swipe", exact: true }).click()
      await expect(page.getByText(/Real whispered transcript|product demo/i).first()).toBeVisible()
    })

    await test.step("recreate the concept with a character", async () => {
      await gotoView(page, "AI UGC avatars")
      // TODO(selector): set the reference (URL/upload), pick recreate workflow, run.
      await page.getByLabel("Edit AI UGC character prompt").fill("recreate this bag ad style")
      await page.getByRole("button", { name: "Generate", exact: true }).click().catch(() => {})
      await expect.poll(() => state.generations.length).toBeGreaterThanOrEqual(1)
    })
  })
})
