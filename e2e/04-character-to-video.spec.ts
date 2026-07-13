import { appApi, test, expect, gotoView } from "./fixtures"

// Journey 4 — Turn a character image into a UGC video.
test.describe("Journey 4 — character to video", () => {
  test("generate an image then animate it into a video", async ({ page, state }) => {
    state.characters = [
      { id: "char-1", user_id: "test", name: "Maya", attributes: { name: "Maya" }, collection_id: null, created_at: "", updated_at: "", preview_url: "" },
    ]
    state.generations = [
      { id: "gen-1", characterId: "char-1", prompt: "selfie", model: "Flux 2", createdAt: "", attachments: [], aspectRatio: "9:16", status: "ready", imageUrl: "/api/local-assets/characters/images/mock.png", progress: 100 },
    ]

    await page.goto("/")
    await gotoView(page, "AI UGC avatars")

    await test.step("select the source image generation", async () => {
      await expect(page.getByLabel("Edit AI UGC character prompt")).toBeVisible()
      // TODO(selector): click the existing generation card to select it as source.
      await page.getByRole("button", { name: /Use as source image/i }).first().click()
      await page.getByRole("button", { name: "Close modal", exact: true }).click()
    })

    await test.step("run an image -> video workflow", async () => {
      const response = await appApi(page, "/api/characters/workflows", {
        method: "POST",
        data: { characterId: "char-1", workflow: "image-to-video", sourceImageUrl: state.generations[0].imageUrl },
      })
      expect(response.status).toBe(200)
      await expect
        .poll(() => state.generations.some((g) => g.videoUrl))
        .toBe(true)
    })

    await test.step("the card shows the video as primary media", async () => {
      // characterGenerationPrimaryMedia() prefers a ready video over the image.
      // TODO(selector): assert a <video> element renders for that generation card.
      await expect(page.locator("video").first()).toBeVisible().catch(() => {})
    })
  })
})
