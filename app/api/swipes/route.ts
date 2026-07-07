import { NextResponse } from "next/server"

import {
  createSwipe,
  deleteSwipe,
  listSwipes,
  type SwipePayload,
} from "@/lib/swipes"

export const dynamic = "force-dynamic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET() {
  const swipes = await listSwipes()
  return NextResponse.json({ swipes }, { headers: corsHeaders })
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SwipePayload
    const swipe = await createSwipe(payload)
    return NextResponse.json({ swipe }, { status: 201, headers: corsHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save swipe" },
      { status: 400, headers: corsHeaders }
    )
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()

  if (!id) {
    return NextResponse.json(
      { error: "A swipe id is required" },
      { status: 400, headers: corsHeaders }
    )
  }

  const swipe = await deleteSwipe(id)
  if (!swipe) {
    return NextResponse.json(
      { error: "Swipe not found" },
      { status: 404, headers: corsHeaders }
    )
  }

  return NextResponse.json({ swipe }, { headers: corsHeaders })
}
