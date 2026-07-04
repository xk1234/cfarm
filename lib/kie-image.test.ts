import { describe, expect, it, vi } from "vitest"

import {
  buildFluxKontextGeneratePayload,
  buildFluxKontextEditPayload,
  buildTopazImageUpscalePayload,
  getKieApiKey,
  prepareKieInputImageUrl,
  readFluxKontextResultUrl,
  readKieTaskId,
  readTopazResultUrl,
} from "./kie-image"

describe("kie image helpers", () => {
  it("builds a Flux Kontext edit payload for image editing", () => {
    expect(buildFluxKontextEditPayload({
      imageUrl: "https://example.com/image.jpg",
      prompt: "make the background bright yellow",
    })).toEqual({
      prompt: "make the background bright yellow",
      inputImage: "https://example.com/image.jpg",
      enableTranslation: true,
      outputFormat: "jpeg",
      promptUpsampling: false,
      model: "flux-kontext-pro",
      safetyTolerance: 2,
    })
  })

  it("builds a Flux Kontext generation payload with the same default model as character image routes", () => {
    expect(buildFluxKontextGeneratePayload({
      prompt: "make a product photo",
      inputImage: "https://example.com/reference.png",
      aspectRatio: "4:5",
      model: "Flux 2",
    })).toEqual({
      prompt: "make a product photo",
      inputImage: "https://example.com/reference.png",
      aspectRatio: "4:5",
      outputFormat: "png",
      promptUpsampling: false,
      model: "flux-kontext-pro",
    })
  })

  it("resolves Kie API key aliases in app order", () => {
    expect(getKieApiKey({
      KIE_API_KEY: "secondary",
      KIE_KEY: "primary",
      KIE_AI_API_KEY: "third",
      FLUX_API_KEY: "flux",
    })).toBe("primary")
    expect(getKieApiKey({ KIE_AI_API_KEY: "third", FLUX_API_KEY: "flux" })).toBe("third")
    expect(getKieApiKey({ FLUX_API_KEY: "flux" })).toBe("flux")
  })

  it("builds a Topaz image upscale task payload", () => {
    expect(buildTopazImageUpscalePayload({
      imageUrl: "https://example.com/image.jpg",
      upscaleFactor: "4",
    })).toEqual({
      model: "topaz/image-upscale",
      input: {
        image_url: "https://example.com/image.jpg",
        upscale_factor: "4",
      },
    })
  })

  it("reads task ids and result URLs from Kie responses", () => {
    expect(readKieTaskId({ code: 200, data: { taskId: "task_123" } })).toBe("task_123")
    expect(readFluxKontextResultUrl({ data: { successFlag: 1, response: { resultImageUrl: "https://cdn/result.jpg" } } })).toBe("https://cdn/result.jpg")
    expect(readTopazResultUrl({ data: { state: "success", resultJson: "{\"resultUrls\":[\"https://cdn/upscaled.jpg\"]}" } })).toBe("https://cdn/upscaled.jpg")
  })

  it("uploads local app assets before passing them to Kie image models", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return new Response(JSON.stringify({
        success: true,
        data: {
          downloadUrl: "https://tempfile.redpandaai.co/images/realfarm/jade-homeysg-preview.png",
        },
      }), { status: 200 })
    })

    const imageUrl = await prepareKieInputImageUrl({
      imageUrl: "http://localhost:3000/api/local-assets/characters/headshots/jade-homeysg-preview.png",
      apiKey: "kie-test-key",
      fetchImpl,
    })

    expect(imageUrl).toBe("https://tempfile.redpandaai.co/images/realfarm/jade-homeysg-preview.png")
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
    const requestBody = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as {
      base64Data: string
      fileName: string
      uploadPath: string
    }
    expect(requestBody.base64Data).toMatch(/^data:image\/png;base64,/)
    expect(requestBody.fileName).toContain("jade-homeysg-preview.png")
    expect(requestBody.uploadPath).toBe("images/realfarm")
  })
})
