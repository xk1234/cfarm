/**
 * Test doubles for the render engine and the publisher (used by API, MCP and
 * job tests). Not imported by runtime code.
 */
import type { RenderOptions, RenderResult } from "@/lib/render/engine"
import { MIME_BY_FORMAT } from "@/lib/render/engine"
import type { ResolvedSpec } from "@/lib/render/spec"
import type {
  CreatePostInput,
  Publisher,
  PublisherAccount,
  UploadMediaInput,
} from "@/lib/publishing/publisher"

/** A 1×1 PNG. */
export const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  )
)

export type FakeRenderCall = { resolved: ResolvedSpec; options: RenderOptions }

/** A renderSpec stand-in: one small "image" per slide, loading every image source. */
export function createFakeRenderSpec() {
  const calls: FakeRenderCall[] = []
  const renderSpec = async (resolved: ResolvedSpec, options: RenderOptions): Promise<RenderResult> => {
    calls.push({ resolved, options })
    const visit = async (layers: ResolvedSpec["slides"][number]["layers"]) => {
      for (const layer of layers) {
        if (layer.type === "image") await options.assets?.load(layer.src)
        if (layer.type === "group") await visit(layer.children)
      }
    }
    const indexes = options.slides ?? resolved.slides.map((_, i) => i)
    const slides = []
    for (const index of indexes) {
      const slide = resolved.slides[index]
      await visit(slide.layers)
      const bytes = new Uint8Array([...TINY_PNG, index])
      slides.push({
        index,
        id: slide.id,
        mime: MIME_BY_FORMAT[options.format],
        bytes,
        width: Math.round(resolved.canvas.width * options.scale),
        height: Math.round(resolved.canvas.height * options.scale),
      })
    }
    return { slides, warnings: [] }
  }
  return { renderSpec, calls }
}

export function createFakePublisher(accounts: PublisherAccount[] = [
  { id: "101", provider: "tiktok", name: "TikTok main", active: true, avatarUrl: null, extra: {} },
  { id: "202", provider: "instagram", name: "IG main", active: true, avatarUrl: null, extra: {} },
]) {
  const uploads: UploadMediaInput[] = []
  const posts: CreatePostInput[] = []
  let next = 1
  const publisher: Publisher = {
    provider: "socialbu",
    configured: true,
    status: () => ({ configured: true, provider: "socialbu" }),
    listAccounts: async () => accounts,
    uploadMedia: async (input) => {
      uploads.push(input)
      return { token: `tok-${uploads.length}`, name: input.name, mime: input.mime, sizeBytes: null, previewUrl: null }
    },
    createPost: async (input) => {
      posts.push(input)
      return {
        posts: input.accounts.map((accountId) => ({
          id: String(next++),
          accountId,
          status: input.publishAt ? ("scheduled" as const) : ("publishing" as const),
          publishAt: input.publishAt ?? null,
          publishedAt: null,
          permalink: null,
          error: null,
        })),
      }
    },
    getPost: async (id) => ({
      id,
      accountId: "101",
      status: "scheduled",
      publishAt: null,
      publishedAt: null,
      permalink: null,
      error: null,
    }),
  }
  return { publisher, uploads, posts }
}
