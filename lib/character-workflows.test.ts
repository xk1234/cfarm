import { describe, expect, it } from "vitest"

import {
  buildKlingMotionControlPayload,
  buildKlingV25StartEndFramePayload,
  buildNanoBananaProPayload,
  buildPoseVariationPrompt,
  buildReferenceAnalysisOpenRouterRequest,
  buildReferenceRecreationPrompt,
  buildSeedreamBedroomSelfiePrompt,
  buildSeedreamV4EditPayload,
  buildWanClothingEditPayload,
  parseReferenceAnalysisContent,
} from "@/lib/character-workflows"

describe("character workflow payloads", () => {
  it("builds a GPT-5.5 structured reference analysis request", () => {
    const request = buildReferenceAnalysisOpenRouterRequest({
      referenceImageUrl: "https://example.com/ref.jpg",
    })

    expect(request.model).toBe("openai/gpt-5.5")
    expect(request.response_format.type).toBe("json_schema")
    expect(request.response_format.json_schema.name).toBe(
      "ugc_reference_recreation_analysis"
    )
    expect(request.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image_url",
          image_url: { url: "https://example.com/ref.jpg" },
        }),
      ])
    )
  })

  it("parses fenced structured reference analysis JSON", () => {
    const parsed = parseReferenceAnalysisContent(
      '```json\n{"composition":{"orientation":"vertical"},"camera":{"shot_type":"selfie"}}\n```'
    )

    expect(parsed.composition.orientation).toBe("vertical")
    expect(parsed.camera.shot_type).toBe("selfie")
  })

  it("builds a generic Nano Banana Pro payload with supplied image inputs", () => {
    expect(
      buildNanoBananaProPayload({
        prompt: "Preserve identity and copy style.",
        imageUrls: ["https://kie/character.png", "https://pin/ref.jpg"],
        aspectRatio: "9:16",
      })
    ).toEqual({
      model: "nano-banana-pro",
      input: {
        prompt: "Preserve identity and copy style.",
        image_input: ["https://kie/character.png", "https://pin/ref.jpg"],
        aspect_ratio: "9:16",
        resolution: "1K",
        output_format: "png",
      },
    })
  })

  it("builds recreate-reference prompt from analyzed JSON instead of a second image", () => {
    const prompt = buildReferenceRecreationPrompt({
      characterName: "Maya",
      characterJson: { gender: "female" },
      analysis: {
        composition: { orientation: "vertical" },
        camera: { shot_type: "mirror selfie" },
        pose: { body_orientation: "angled" },
        facial_expression: { eyes: "relaxed" },
        hair: {},
        clothing: {},
        accessories: {},
        environment: {},
        lighting: {},
        recreation_notes: {},
      },
    })

    expect(prompt).toContain("reference recipe:")
    expect(prompt).toContain('"orientation": "vertical"')
    expect(prompt).toContain(
      "Use the reference recipe JSON below for pose, composition"
    )
    expect(prompt).not.toContain("Use image 2")
  })

  it("builds a Kling 3 motion-control request with image orientation locked", () => {
    expect(
      buildKlingMotionControlPayload({
        prompt: "Follow the movement precisely.",
        characterImageUrl: "https://kie/character.png",
        motionVideoUrl: "https://kie/motion.mp4",
      })
    ).toEqual({
      model: "kling-3.0/motion-control",
      input: {
        prompt: "Follow the movement precisely.",
        input_urls: ["https://kie/character.png"],
        video_urls: ["https://kie/motion.mp4"],
        mode: "720p",
        character_orientation: "image",
        background_source: "input_video",
      },
    })
  })

  it("builds a Nano Banana Pro pose variation prompt", () => {
    expect(buildPoseVariationPrompt()).toBe(
      "Edit the original image to create a strong pose variation. Increase head tilt significantly. Lean the face slightly closer toward the camera. Angle the head downward and sideways as if filmed from a tilted handheld selfie. Preserve identity, face structure, hairstyle, and outfit. Background and lighting may remain simple."
    )
  })

  it("builds a Kling 2.5 start/end frame request under 10 seconds", () => {
    expect(
      buildKlingV25StartEndFramePayload({
        prompt: "move from frame one to frame two",
        startImageUrl: "https://kie/start.png",
        endImageUrl: "https://kie/end.png",
        duration: "10",
      })
    ).toEqual({
      model: "kling/v2-5-turbo-image-to-video-pro",
      input: {
        prompt: "move from frame one to frame two",
        image_url: "https://kie/start.png",
        tail_image_url: "https://kie/end.png",
        duration: "10",
        negative_prompt:
          "blur, distort, low quality, warped face, identity drift",
        cfg_scale: 0.5,
      },
    })
  })

  it("builds Seedream v4 bedroom selfie edit prompt and payload", () => {
    const prompt = buildSeedreamBedroomSelfiePrompt({
      template: "tank_top_flirty_smile",
      breastSize: "d cup",
    })

    expect(prompt).toContain("adult woman")
    expect(prompt).toContain("d cup")
    expect(
      buildSeedreamV4EditPayload({
        prompt,
        imageUrls: ["https://kie/character.png"],
      })
    ).toMatchObject({
      model: "bytedance/seedream-v4-edit",
      input: {
        prompt,
        image_urls: ["https://kie/character.png"],
        image_size: "portrait_16_9",
        image_resolution: "1K",
        max_images: 1,
      },
    })
  })

  it("builds Wan clothing transfer edit request with two images", () => {
    expect(
      buildWanClothingEditPayload({
        influencerImageUrl: "https://kie/influencer.png",
        clothingImageUrl: "https://kie/outfit.png",
      })
    ).toEqual({
      model: "wan/2-7-image",
      input: {
        prompt:
          "have the woman in image 1 wearing the clothing from reference image 2. Preserve facial structure, skin texture, lighting and body proportions.",
        input_urls: ["https://kie/influencer.png", "https://kie/outfit.png"],
        aspect_ratio: "9:16",
        enable_sequential: false,
        n: 1,
        resolution: "2K",
        thinking_mode: false,
        watermark: false,
      },
    })
  })
})
