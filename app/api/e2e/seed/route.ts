/**
 * Local e2e fixture seeding. 404 unless the e2e auth seam is active
 * (lib/e2e-auth.ts: memory backend, non-production, LUMENCLIP_E2E_USER_ID),
 * so it can never write to Appwrite or run in production.
 */
import { NextResponse } from "next/server"

import { getRepositories } from "@/lib/data"
import { e2eAuthUserId } from "@/lib/e2e-auth"
import { seedE2eWorkspace } from "@/lib/e2e-seed"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  const userId = e2eAuthUserId()
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const result = await seedE2eWorkspace(getRepositories(), userId)
  return NextResponse.json(result)
}
