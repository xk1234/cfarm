import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { createDemoVideo, listDemoVideos } from "@/lib/demos"

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ demos: await listDemoVideos(user.$id) })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const form = await request.formData()
  const file = form.get("file")
  const title = String(form.get("title") || "Untitled demo")
    .trim()
    .slice(0, 160)
  if (!(file instanceof File) || !file.type.startsWith("video/"))
    return NextResponse.json({ error: "Choose a video file." }, { status: 400 })
  if (file.size > 250 * 1024 * 1024)
    return NextResponse.json(
      { error: "Videos must be smaller than 250 MB." },
      { status: 413 }
    )
  try {
    return NextResponse.json(
      { demo: await createDemoVideo({ ownerId: user.$id, title, file }) },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ error: "Video upload failed." }, { status: 500 })
  }
}
