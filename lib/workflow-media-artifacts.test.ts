import { describe, expect, it, vi } from "vitest"

import { workflowMediaArtifacts } from "@/lib/workflow-media-artifacts"

describe("workflow media artifacts", () => {
  it("turns intermediate image and video URLs into typed previewable artifacts", () => {
    vi.stubEnv("BASE_URL", "https://lumenclip.example")
    expect(
      workflowMediaArtifacts({
        slides: [
          {
            imageUrl: "/api/local-assets/slideshows/slide-1.png",
            width: 1080,
            height: 1920,
          },
        ],
        render: {
          videoUrl: "https://cdn.example/output.mp4",
          thumbnailUrl: "https://cdn.example/poster.jpg",
          durationSeconds: 12,
        },
      })
    ).toEqual([
      expect.objectContaining({
        kind: "image",
        mimeType: "image/png",
        source: {
          type: "appwrite",
          url: "https://lumenclip.example/api/local-assets/slideshows/slide-1.png",
        },
        preview: {
          type: "image",
          url: "https://lumenclip.example/api/local-assets/slideshows/slide-1.png",
        },
        metadata: { width: 1080, height: 1920 },
      }),
      expect.objectContaining({
        kind: "video",
        mimeType: "video/mp4",
        preview: {
          type: "video",
          url: "https://cdn.example/output.mp4",
          thumbnailUrl: "https://cdn.example/poster.jpg",
        },
        metadata: { durationSeconds: 12 },
      }),
      expect.objectContaining({ kind: "image", role: "thumbnail" }),
    ])
  })

  it("deduplicates the same media carried through nested stage outputs", () => {
    const artifacts = workflowMediaArtifacts({
      selectedImage: { imageUrl: "https://cdn.example/a.webp" },
      plan: { slides: [{ imageUrl: "https://cdn.example/a.webp" }] },
    })
    expect(artifacts).toHaveLength(1)
  })
})
