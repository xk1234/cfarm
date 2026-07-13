import { NextResponse } from "next/server"

import { readRouteId } from "@/lib/api"

import { deleteSwipe } from "@/lib/swipes"

export const dynamic = "force-dynamic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await readRouteId(params)
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
