import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it, vi } from "vitest"

import {
  deleteAssetFromAppwrite,
  mirrorAssetToAppwrite,
} from "@/lib/asset-storage"

import {
  buildFluxKontextGeneratePayload,
  buildFluxKontextEditPayload,
  buildNanoBananaProPayload,
  buildTopazImageUpscalePayload,
  getKieApiKey,
  prepareKieInputImageUrl,
  readFluxKontextResultUrl,
  readKieTaskId,
  readKieMarketResultUrls,
  readTopazResultUrl,
  prepareKieInputFileUrl,
} from "./kie-image"

describe("kie image helpers", () => {
  it("builds a Nano Banana Pro payload for generic image generation", () => {
    expect(
      buildNanoBananaProPayload({
        prompt: "Create an editorial football graphic",
        imageUrls: ["https://example.com/reference.png"],
        aspectRatio: "16:9",
      })
    ).toEqual({
      model: "nano-banana-pro",
      input: {
        prompt: "Create an editorial football graphic",
        image_input: ["https://example.com/reference.png"],
        aspect_ratio: "16:9",
        resolution: "1K",
        output_format: "png",
      },
    })
  })

  it("builds a Flux Kontext edit payload for image editing", () => {
    expect(
      buildFluxKontextEditPayload({
        imageUrl: "https://example.com/image.jpg",
        prompt: "make the background bright yellow",
      })
    ).toEqual({
      prompt: "make the background bright yellow",
      inputImage: "https://example.com/image.jpg",
      enableTranslation: true,
      outputFormat: "jpeg",
      promptUpsampling: false,
      model: "flux-kontext-pro",
      safetyTolerance: 2,
    })
  })

  it("builds a Flux Kontext generation payload with the shared image-edit model", () => {
    expect(
      buildFluxKontextGeneratePayload({
        prompt: "make a product photo",
        inputImage: "https://example.com/reference.png",
        aspectRatio: "4:5",
        model: "Flux 2",
      })
    ).toEqual({
      prompt: "make a product photo",
      inputImage: "https://example.com/reference.png",
      aspectRatio: "4:5",
      outputFormat: "png",
      promptUpsampling: false,
      model: "flux-kontext-pro",
    })
  })

  it("uses KIE_KEY as the only Kie API key env name", () => {
    expect(
      getKieApiKey({
        KIE_KEY: "primary",
      })
    ).toBe("primary")
    expect(getKieApiKey({ OTHER_KEY: "other" })).toBe("")
  })

  it("builds a Topaz image upscale task payload", () => {
    expect(
      buildTopazImageUpscalePayload({
        imageUrl: "https://example.com/image.jpg",
        upscaleFactor: "4",
      })
    ).toEqual({
      model: "topaz/image-upscale",
      input: {
        image_url: "https://example.com/image.jpg",
        upscale_factor: "4",
      },
    })
  })

  it("reads task ids and result URLs from Kie responses", () => {
    expect(readKieTaskId({ code: 200, data: { taskId: "task_123" } })).toBe(
      "task_123"
    )
    expect(
      readFluxKontextResultUrl({
        data: {
          successFlag: 1,
          response: { resultImageUrl: "https://cdn/result.jpg" },
        },
      })
    ).toBe("https://cdn/result.jpg")
    expect(
      readTopazResultUrl({
        data: {
          state: "success",
          resultJson: '{"resultUrls":["https://cdn/upscaled.jpg"]}',
        },
      })
    ).toBe("https://cdn/upscaled.jpg")
    expect(
      readKieMarketResultUrls({
        data: {
          state: "success",
          resultJson: '{"resultUrls":["https://cdn/market.jpg"]}',
        },
      })
    ).toEqual(["https://cdn/market.jpg"])
  })

  it("uploads local app assets before passing them to Kie image models", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "cfarm-kie-image-asset-")
    )
    vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
    const imagePath = path.join(
      tempRoot,
      "data",
      "image-collections",
      "product-shots",
      "product-preview.png"
    )
    await mirrorAssetToAppwrite(imagePath, new Uint8Array([0, 1, 2, 3]))

    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              downloadUrl:
                "https://tempfile.redpandaai.co/images/realfarm/product-preview.png",
            },
          }),
          { status: 200 }
        )
      }
    )

    const imageUrl = await prepareKieInputImageUrl({
      imageUrl:
        "http://localhost:3000/api/local-assets/image-collections/product-shots/product-preview.png",
      apiKey: "kie-test-key",
      fetchImpl,
    })

    expect(imageUrl).toBe(
      "https://tempfile.redpandaai.co/images/realfarm/product-preview.png"
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kieai.redpandaai.co/api/file-base64-upload",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer kie-test-key",
          "Content-Type": "application/json",
        },
      })
    )
    const requestBody = JSON.parse(
      fetchImpl.mock.calls[0]?.[1]?.body as string
    ) as {
      base64Data: string
      fileName: string
      uploadPath: string
    }
    expect(requestBody.base64Data).toMatch(/^data:image\/png;base64,/)
    expect(requestBody.fileName).toContain("product-preview.png")
    expect(requestBody.uploadPath).toBe("images/realfarm")
    await deleteAssetFromAppwrite(imagePath)
    await rm(tempRoot, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it("uploads local app video assets before passing them to Kie motion-control", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "cfarm-kie-video-asset-")
    )
    vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
    const motionPath = path.join(
      tempRoot,
      "data",
      "assets",
      "demos",
      "motion.mp4"
    )
    await mirrorAssetToAppwrite(motionPath, new Uint8Array([0, 1, 2, 3]))
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: {
              downloadUrl:
                "https://tempfile.redpandaai.co/videos/realfarm/motion.mp4",
            },
          }),
          { status: 200 }
        )
    )

    const videoUrl = await prepareKieInputFileUrl({
      fileUrl: "/api/local-assets/assets/demos/motion.mp4",
      apiKey: "kie-test-key",
      uploadPath: "videos/realfarm",
      fetchImpl,
    })

    expect(videoUrl).toBe(
      "https://tempfile.redpandaai.co/videos/realfarm/motion.mp4"
    )
    const requestBody = JSON.parse(
      fetchImpl.mock.calls[0]?.[1]?.body as string
    ) as {
      base64Data: string
      uploadPath: string
    }
    expect(requestBody.base64Data).toMatch(/^data:video\/mp4;base64,/)
    expect(requestBody.uploadPath).toBe("videos/realfarm")
    await deleteAssetFromAppwrite(motionPath)
    await rm(tempRoot, { recursive: true, force: true })
    vi.restoreAllMocks()
  })
})
