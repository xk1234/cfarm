import { expect, test } from "@playwright/test"

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const

for (const viewport of viewports) {
  test(`${viewport.name} pages do not create page-level horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)

    for (const path of ["/", "/analytics-preview/overall"]) {
      await page.goto(path)
      await expect(page.locator("body")).toBeVisible()

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))

      expect(
        dimensions.scrollWidth,
        `${path} overflowed at ${viewport.width}px`
      ).toBeLessThanOrEqual(dimensions.clientWidth)
    }
  })
}
