// Temp driver: mint an Appwrite session, open the app headless, and click
// through each Astro video-template automation's Create button.
import { chromium } from "@playwright/test"
import { Client, Users } from "node-appwrite"

const USER_ID = "6a5206ff00287e1fe617"
const NAMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "Astro Aesthetic",
      "Astro Compilation",
      "Astro React & Reveal",
      "Astro Birdseye POV",
      "Astro Screenshot Pictures",
      "Astro Screen Record",
    ]

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const users = new Users(client)
const session = await users.createSession(USER_ID)
console.log("session minted:", session.$id)

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
})
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await context.addCookies([
  {
    name: "lumenclip-session",
    value: session.secret,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
])
const page = await context.newPage()
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("[console.error]", msg.text().slice(0, 200))
})

async function openAutomations() {
  await page.goto("http://localhost:3000/app", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Automations" }).click()
  await page.waitForTimeout(1500)
}

for (const name of NAMES) {
  console.log("=== ", name)
  await openAutomations()
  const card = page.locator("article, div").filter({ hasText: name }).last()
  // click the Edit button inside the automation card
  const editButton = page
    .locator(`text=${name}`)
    .locator("xpath=ancestor::*[.//button[contains(., 'Edit')]][1]")
    .locator("button", { hasText: "Edit" })
    .first()
  await editButton.click()
  await page.waitForTimeout(1200)
  await page.getByRole("button", { name: "Video Format" }).click()
  await page.waitForTimeout(1500)

  const createButton = page.getByRole("button", { name: /^Create .* video$/ })
  await createButton.waitFor({ timeout: 10000 })
  const beforeIds = await page.evaluate(async () => {
    const res = await fetch("/api/generated-videos?type=template_video").then((r) => r.json())
    return (res.exports ?? []).map((e) => e.id)
  })
  await createButton.click()
  console.log("clicked create, waiting for render...")

  const deadline = Date.now() + 300_000
  let outcome = "timeout"
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000)
    const exportsNow = await page.evaluate(async () => {
      const res = await fetch("/api/generated-videos?type=template_video").then((r) => r.json())
      return (res.exports ?? []).map((e) => ({ id: e.id, status: e.status, title: e.title, videoUrl: e.videoUrl, error: e.error }))
    })
    const fresh = exportsNow.filter((e) => !beforeIds.includes(e.id))
    if (fresh.length > 0) {
      const latest = fresh[0]
      if (latest.status === "ready") { outcome = "ready: " + latest.videoUrl + " | hook: " + latest.title; break }
      if (latest.status === "failed") { outcome = "failed: " + latest.error; break }
    }
    const errorText = await page.locator("p.text-\\[\\#d94444\\], [class*='d94444']").first().textContent().catch(() => null)
    if (errorText) { outcome = "ui-error: " + errorText; break }
  }
  console.log(name, "→", outcome)
}

await browser.close()
console.log("done")
