import "server-only"

/**
 * Fixture data for the local e2e suite (e2e/*.spec.ts). Only reachable through
 * `POST /api/e2e/seed`, which is guarded by the e2e auth seam
 * (lib/e2e-auth.ts): memory backend, non-production, e2e user id set.
 *
 * Media are small PNGs generated locally with node-canvas; nothing is fetched.
 */
import { createCanvas } from "canvas"

import type { Repositories, WorkspaceId } from "@/lib/data"
import { renderSpec } from "@/lib/render/engine"
import { storeMedia } from "@/lib/renders/media"
import { submitRender } from "@/lib/renders/service"

export const E2E_COLLECTIONS = [
  { name: "Sunsets", colors: ["#f97316", "#ef4444", "#facc15"] },
  { name: "Textures", colors: ["#0ea5e9", "#22c55e", "#a855f7"] },
] as const

export const E2E_RENDER_TITLE = "Seeded quote carousel"

/** A solid PNG with a diagonal band, so slides are visibly not blank. */
export function generatePng(color: string, label: string, size = 320): Uint8Array {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = "rgba(255,255,255,0.35)"
  ctx.beginPath()
  ctx.moveTo(0, size * 0.65)
  ctx.lineTo(size * 0.65, 0)
  ctx.lineTo(size, 0)
  ctx.lineTo(0, size)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = "#111111"
  ctx.font = "bold 28px sans-serif"
  ctx.fillText(label, 16, size - 20)
  return new Uint8Array(canvas.toBuffer("image/png"))
}

export type E2eSeedResult = {
  collections: { id: string; name: string; mediaIds: string[] }[]
  renderId: string
}

export async function seedE2eWorkspace(repos: Repositories, workspaceId: WorkspaceId): Promise<E2eSeedResult> {
  const collections: E2eSeedResult["collections"] = []
  for (const fixture of E2E_COLLECTIONS) {
    const collection =
      (await repos.collections.getByName(workspaceId, fixture.name)) ??
      (await repos.collections.create(workspaceId, { name: fixture.name, createdBy: workspaceId }))
    const mediaIds: string[] = []
    for (const [index, color] of fixture.colors.entries()) {
      const { media } = await storeMedia(repos, workspaceId, {
        bytes: generatePng(color, `${fixture.name} ${index + 1}`),
        mime: "image/png",
        name: `${fixture.name.toLowerCase()}-${index + 1}.png`,
        collectionId: collection.id,
        source: "upload",
        createdBy: workspaceId,
      })
      mediaIds.push(media.id)
    }
    collections.push({ id: collection.id, name: collection.name, mediaIds })
  }

  const [first] = collections
  const result = await submitRender({ repos, renderSpec }, workspaceId, seedRenderRequest(first.mediaIds), {
    source: "ui",
    createdBy: workspaceId,
  })
  if (result.render.status !== "succeeded") {
    throw new Error(`Seed render did not succeed (${result.render.status}): ${result.render.error ?? "unknown"}`)
  }
  return { collections, renderId: result.render.id }
}

function seedRenderRequest(mediaIds: readonly string[]) {
  return {
    idempotencyKey: "e2e-seed-render",
    spec: {
      version: 1,
      name: E2E_RENDER_TITLE,
      canvas: { width: 540, height: 960, background: "#111111" },
      slides: mediaIds.slice(0, 2).map((media, index) => ({
        id: `seed-${index + 1}`,
        layers: [
          { id: "photo", type: "image", src: { media }, frame: { inset: 0 }, fit: "cover" },
          {
            id: "caption",
            type: "text",
            text: `Seeded slide ${index + 1}`,
            frame: { x: "50%", y: "50%", width: "84%", anchor: "center" },
            style: { fontFamily: "Inter", fontSize: 44, fontWeight: 800, color: "#ffffff", align: "center" },
          },
        ],
      })),
    },
  }
}
