import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 390, height: 844 } })

test("marketing navigation opens as a full-screen mobile menu", async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })

  await page.goto("/")

  const navbar = page.locator("nav").first()
  await expect(
    navbar.getByRole("link", { name: "LumenClip home" })
  ).toBeVisible()
  await expect(navbar.getByRole("button", { name: "Open menu" })).toBeVisible()
  await expect(navbar.getByRole("link", { name: "Log in" })).toBeHidden()

  await navbar.getByRole("button", { name: "Open menu" }).click()

  const dialog = page.getByRole("dialog", { name: "Mobile navigation" })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole("link", { name: "LumenClip home" })
  ).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Close menu" })).toBeVisible()
  await expect(dialog).toHaveCSS("position", "fixed")
  await expect(dialog).toHaveCSS("inset", "0px")

  const bounds = await dialog.boundingBox()
  expect(bounds).toEqual({ x: 0, y: 0, width: 390, height: 844 })
  expect(consoleErrors).toEqual([])
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0)
})
