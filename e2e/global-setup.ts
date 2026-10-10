import { request, type FullConfig } from "@playwright/test"

/**
 * Fails fast unless the server runs the local e2e seam (memory backend, no
 * Clerk): `/api/e2e/seed` answers 404 everywhere else, including production.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  const context = await request.newContext({ baseURL })
  try {
    const response = await context.post("/api/e2e/seed")
    if (!response.ok()) {
      throw new Error(
        `E2E seed failed (${response.status()}). The server must run with LUMENCLIP_DATA_BACKEND=memory and LUMENCLIP_E2E_USER_ID outside production.`
      )
    }
  } finally {
    await context.dispose()
  }
}
