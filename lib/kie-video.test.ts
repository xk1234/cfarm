import { describe, expect, it } from "vitest"

import {
  buildKieImageToVideoPayload,
  readKieVideoResultUrl,
} from "./kie-video"

describe("kie video helpers", () => {
  it("builds a Kling image-to-video task payload", () => {
    expect(buildKieImageToVideoPayload({
      imageUrl: "https://example.com/character.png",
      prompt: "The character turns toward the camera and smiles.",
      model: "Kling 2.6 Image to Video",
      duration: "5",
      sound: false,
    })).toEqual({
      model: "kling-2.6/image-to-video",
      input: {
        prompt: "The character turns toward the camera and smiles.",
        image_urls: ["https://example.com/character.png"],
        sound: false,
        duration: "5",
      },
    })
  })

  it("builds a Seedance first-frame image-to-video task payload", () => {
    expect(buildKieImageToVideoPayload({
      imageUrl: "https://example.com/character.png",
      prompt: "The character walks through a bright office.",
      model: "Seedance 2.0",
      duration: "10",
      aspectRatio: "9:16",
      sound: true,
    })).toEqual({
      model: "bytedance/seedance-2",
      input: {
        prompt: "The character walks through a bright office.",
        first_frame_url: "https://example.com/character.png",
        return_last_frame: false,
        generate_audio: true,
        resolution: "720p",
        aspect_ratio: "9:16",
        duration: 10,
        web_search: false,
      },
    })
  })

  it("reads video result URLs from Kie common task responses", () => {
    expect(readKieVideoResultUrl({
      data: {
        state: "success",
        resultJson: JSON.stringify({
          resultUrls: ["https://cdn.example.com/generated.mp4"],
        }),
      },
    })).toBe("https://cdn.example.com/generated.mp4")
    expect(readKieVideoResultUrl({
      data: {
        state: "success",
        resultJson: JSON.stringify({
          result_video_url: "https://cdn.example.com/generated-video.mp4",
        }),
      },
    })).toBe("https://cdn.example.com/generated-video.mp4")
  })
})
