import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { withSystemOwner } from "@/lib/system-owner-context"
import {
  inspectTikTokPublicationImport,
  linkTikTokPublicationImport,
  startTikTokPublicationImport,
} from "@/lib/tiktok-publication-import"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const startSchema = z.object({
  action: z.literal("start"),
  automationId: z.string().trim().min(1),
  urls: z.array(z.string().trim().min(1)).min(1).max(20),
})

const linkSchema = z.object({
  action: z.literal("link"),
  automationId: z.string().trim().min(1),
  operationId: z.string().trim().min(1),
  integrationId: z.string().trim().min(1),
  selections: z
    .array(
      z
        .object({
          postId: z.string().trim().min(1),
          runId: z.string().trim().min(1).optional(),
          recover: z.boolean().optional(),
        })
        .refine((value) => Boolean(value.runId) !== Boolean(value.recover), {
          message: "Choose one generated slideshow or recovery",
        })
    )
    .min(1)
    .max(20),
})

export const GET = withHandler(async (request: Request) => {
  const user = await requireUser()
  const search = new URL(request.url).searchParams
  const operationId = search.get("operationId")?.trim()
  const automationId = search.get("automationId")?.trim()
  if (!operationId || !automationId) {
    throw new ApiError(400, "operationId and automationId are required")
  }

  const preview = await withSystemOwner(user.$id, () =>
    inspectTikTokPublicationImport({ operationId, automationId })
  )
  return NextResponse.json({ preview })
})

export const POST = withHandler(async (request: Request) => {
  const user = await requireUser()
  const body = await request.json().catch(() => null)
  if (body?.action === "start") {
    const input = validate(startSchema, body)
    const operation = await withSystemOwner(user.$id, () =>
      startTikTokPublicationImport(input.urls)
    )
    return NextResponse.json({ operation }, { status: 202 })
  }
  if (body?.action === "link") {
    const input = validate(linkSchema, body)
    const links = await withSystemOwner(user.$id, () =>
      linkTikTokPublicationImport(input)
    )
    return NextResponse.json({ links })
  }
  throw new ApiError(400, "action must be start or link")
})

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication required")
  return user
}
