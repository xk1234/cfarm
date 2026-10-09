import { NextResponse } from "next/server"

import {
  getCurrentUser,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/auth"
import { clean, isRecord } from "@/lib/guards"
import { listVisiblePostFastIntegrationPayload } from "@/lib/postfast-integrations"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { integrations, disconnectedIntegrations } =
      await listVisiblePostFastIntegrationPayload(user.$id)
    return NextResponse.json({
      integrations,
      disconnectedIntegrations,
      configured: true,
    })
  } catch (error) {
    return postfastRouteError(error)
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const payload = await request.json().catch(() => null)
  const id = clean(isRecord(payload) ? payload.integrationId : "")
  if (!id) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    )
  }

  try {
    const preferences = await getUserPreferences(user.$id)
    const disconnectedIds = new Set(disconnectedIntegrationIds(preferences))
    disconnectedIds.add(id)
    await updateUserPreferences(user.$id, {
      postfastDisconnectedIntegrationIds: [...disconnectedIds],
    })
    return NextResponse.json({
      disconnected: true,
      integrationId: id,
    })
  } catch (error) {
    return postfastRouteError(error)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const payload = await request.json().catch(() => null)
  const id = clean(isRecord(payload) ? payload.integrationId : "")
  if (!id) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    )
  }

  try {
    const preferences = await getUserPreferences(user.$id)
    await updateUserPreferences(user.$id, {
      postfastDisconnectedIntegrationIds: disconnectedIntegrationIds(
        preferences
      ).filter((integrationId) => integrationId !== id),
    })
    return NextResponse.json({ restored: true, integrationId: id })
  } catch (error) {
    return postfastRouteError(error)
  }
}

function disconnectedIntegrationIds(value: unknown) {
  if (!isRecord(value)) return []
  return Array.isArray(value.postfastDisconnectedIntegrationIds)
    ? value.postfastDisconnectedIntegrationIds.map(clean).filter(Boolean)
    : []
}
