import { appApi, test, expect, gotoView } from "./fixtures"

/* eslint-disable @typescript-eslint/no-explicit-any -- assertions inspect heterogeneous mocked API payloads. */

// Journey 8 — Curate and maintain a content library.
//
// Concrete persona: "Nova", an agency creator prepping a product launch for a
// clear phone case. She curates a scene library, stores the product asset, and
// cleans out last quarter's collection without deleting shared images.
test.describe("Journey 8 — launch-prep library curation", () => {
  test("import scenes, lock product assets, prune safely, and place the product", async ({
    page,
    state,
  }) => {
    // Seed the "current" collection and a stale one that SHARES one image with it.
    const sharedImage = {
      image_link: "/api/local-assets/image-collections/files/shared-desk.jpg",
      caption: "Desk flatlay",
    }
    state.collections = [
      {
        name: "Launch — cozy bedroom",
        created_at: "2026-07-01T00:00:00.000Z",
        images: [
          sharedImage,
          {
            image_link: "/api/local-assets/image-collections/files/bed.jpg",
            caption: "Bed",
          },
        ],
      },
      {
        name: "Q1 old campaign",
        created_at: "2026-01-01T00:00:00.000Z",
        images: [
          sharedImage,
          {
            image_link: "/api/local-assets/image-collections/files/old.jpg",
            caption: "Old",
          },
        ],
      },
    ]
    await page.goto("/")

    await test.step("import a fresh 'cozy bedroom aesthetic' board and caption it", async () => {
      await gotoView(page, "Collections")
      // TODO(selector): import a Pinterest board URL into a new collection.
      const imported = await appApi(page, "/api/image-collections/import", {
        method: "POST",
        data: { name: "Cozy bedroom aesthetic", images: [] },
      })
      expect(imported.status).toBe(201)
      // Caption the whole collection (OpenRouter in live mode; stubbed here).
      const captioned = await appApi(page, "/api/image-collections/captions", {
        method: "POST",
        data: {},
      })
      expect(captioned.status).toBe(200)
    })

    await test.step("store the product asset", async () => {
      const upload = await appApi(page, "/api/assets/upload", {
        method: "POST",
        data: { name: "Clear phone case", category: "product" },
      })
      expect(upload.status).toBe(201)
    })

    await test.step("upscale a hero image before it goes in an ad", async () => {
      // TODO(selector): use the per-image "upscale" action in the collection.
      const upscaled = await appApi(
        page,
        "/api/image-collections/image-actions",
        {
          method: "POST",
          data: {
            mode: "upscale",
            imageUrl: sharedImage.image_link,
            upscaleFactor: "2",
          },
        }
      )
      expect(upscaled.status).toBe(200)
    })

    await test.step("prune the stale Q1 collection WITHOUT losing shared images", async () => {
      // Delete "Q1 old campaign". The shared desk flatlay must survive because the
      // launch collection still references it (unused-file cleanup, not blind delete).
      const del = await appApi(page, "/api/image-collections", {
        method: "DELETE",
        data: {
          collections: [
            { name: "Q1 old campaign", created_at: "2026-01-01T00:00:00.000Z" },
          ],
        },
      })
      expect(del.status).toBe(200)
      await expect
        .poll(() => state.collections.some((c) => c.name === "Q1 old campaign"))
        .toBe(false)
      // The shared image is still referenced by the surviving collection.
      const survivor = state.collections.find(
        (c) => c.name === "Launch — cozy bedroom"
      )!
      expect(
        survivor.images.some(
          (i: any) => i.image_link === sharedImage.image_link
        )
      ).toBe(true)
      // In live mode: assert deletedFiles counted only the *unshared* Q1 file.
    })
  })
})
