import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import {
  getGenerationModelSettings,
  saveGenerationModelSettings,
} from "@/lib/generation-model-settings"

export const dynamic = "force-dynamic"

const settingsSchema = z.object({
  slideshowTextModel: z.string().trim().min(1).max(255),
  imageCaptioningModel: z.string().trim().min(1).max(255),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ settings: await getGenerationModelSettings() })
}

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = settingsSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter valid OpenRouter model IDs." },
      { status: 400 }
    )
  }
  return NextResponse.json({
    settings: await saveGenerationModelSettings(parsed.data),
  })
}
