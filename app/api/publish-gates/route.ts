import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import type { ComposerValue } from "@/components/realfarm/composer/composer-types"
import { getCurrentUser } from "@/lib/auth"
import {
  publishGateContent,
  publishGateMedia,
  type PublishGateMetadata,
} from "@/lib/content-composition"
import { getContentOutputs } from "@/lib/content-output-repository"
import {
  composeLimitErrors,
  publishComposerValue,
  type ComposePublishMode,
} from "@/lib/compose-publishing"
import { clean } from "@/lib/guards"
import { listConnectedPostFastIntegrations } from "@/lib/postfast-integrations"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  const payload = await request.json().catch(() => null)
  const outputIds = Array.isArray(payload?.outputIds)
    ? payload.outputIds.map((id: unknown) => clean(id)).filter(Boolean)
    : []
  const selectedIds = Array.isArray(payload?.selectedAccountIds)
    ? payload.selectedAccountIds.map((id: unknown) => clean(id)).filter(Boolean)
    : []
  const mode: ComposePublishMode =
    payload?.mode === "schedule"
      ? "schedule"
      : payload?.mode === "now"
        ? "now"
        : "draft"
  const scheduledAt = clean(payload?.scheduledAt) || undefined
  if (outputIds.length === 0 || selectedIds.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one output and one destination" },
      { status: 400 }
    )
  }
  if (mode === "schedule") {
    const timestamp = Date.parse(scheduledAt ?? "")
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      return NextResponse.json(
        { error: "Choose a future date and time" },
        { status: 400 }
      )
    }
  }

  try {
    const outputs = await getContentOutputs(outputIds)
    if (outputs.length !== new Set(outputIds).size) {
      return NextResponse.json(
        { error: "One or more outputs were not found" },
        { status: 404 }
      )
    }
    const allowed = await listConnectedPostFastIntegrations(user.$id)
    const accounts = allowed
      .filter((item) => selectedIds.includes(item.integration_id))
      .map((item) => ({
        integrationId: item.integration_id,
        platformKey: item.provider,
        accountName: item.name,
        handle: item.profile ?? item.name,
        avatarUrl: item.picture,
      }))
    if (accounts.length !== new Set(selectedIds).size) {
      return NextResponse.json(
        { error: "One or more destinations are not connected" },
        { status: 403 }
      )
    }
    const metadata = publishGateMetadata(payload?.metadata)
    const value: ComposerValue = {
      base: {
        text: publishGateContent(outputs, metadata),
        media: publishGateMedia(outputs),
      },
      perNetwork: {},
    }
    const errors = composeLimitErrors(value, accounts)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 422 })
    }
    const gateId = randomUUID()
    const result = await publishComposerValue({
      value,
      accounts,
      mode,
      scheduledAt,
      sourceId: gateId,
      sourceOutputIds: outputIds,
      postMetadata: {
        title: metadata.title,
        hashtags: metadata.hashtags,
      },
      uploadMedia: (url) => uploadThroughPostFastSeam(url, request),
    })
    const succeeded = result.results.filter((item) => item.ok)
    const failed = result.results.filter((item) => !item.ok)
    return NextResponse.json(
      {
        publishGate: {
          id: gateId,
          outputIds,
          metadata,
          mode,
          scheduledAt,
          status:
            failed.length === 0
              ? "complete"
              : succeeded.length > 0
                ? "partial"
                : "failed",
        },
        succeeded,
        failed,
      },
      { status: failed.length === result.results.length ? 502 : 201 }
    )
  } catch (error) {
    return postfastRouteError(error)
  }
}

function publishGateMetadata(value: unknown): PublishGateMetadata {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    title: clean(record.title) || undefined,
    caption: clean(record.caption) || undefined,
    description: clean(record.description) || undefined,
    hashtags: Array.isArray(record.hashtags)
      ? record.hashtags.map((item) => clean(item)).filter(Boolean)
      : clean(record.hashtags)
          .split(/[\s,]+/)
          .filter(Boolean),
  }
}

async function uploadThroughPostFastSeam(url: string, request: Request) {
  const response = await fetch(new URL("/api/postfast/upload", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ url }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.upload)
    throw new Error(payload?.error || "Media upload failed")
  return payload.upload
}
