import { describe, expect, it } from "vitest"

import {
  defaultAutomationSchema,
  schemaWithAutomationCollectionId,
} from "@/lib/realfarm-automation"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation } from "@/lib/realfarm-data"
import { videoAutomationTemplatePreset } from "@/lib/video-automation-templates"

import {
  automationVideoGenerationIssue,
  resolveMediaCollection,
} from "./automation-video-generation"

const automation = {
  id: "video-automation",
  name: "Video automation",
  status: "live",
  account: "LumenClip",
  handle: "@lumenclip",
  times: [],
  automationKind: "video",
  favorite: false,
  theme: "default",
  socialIntegrations: [],
} satisfies Automation

const imageCollection = collection("photos", "image")
const videoCollection = collection("existing-videos", "video")

describe("automation video media resolution", () => {
  it("does not fall back to an unrelated video collection when the saved id is blank", () => {
    const config = schemaWithAutomationCollectionId(
      {
        ...defaultAutomationSchema(automation),
        video_format: videoAutomationTemplatePreset("ugc_ad").buildFormat(),
      },
      "content",
      ""
    )

    expect(
      resolveMediaCollection([imageCollection, videoCollection], "", "video")
    ).toBeUndefined()
    expect(
      automationVideoGenerationIssue(
        config,
        [imageCollection, videoCollection],
        []
      )
    ).toBe(
      "Choose or create a video collection with at least one video before generating."
    )
  })

  it("uses the explicitly selected video collection", () => {
    expect(
      resolveMediaCollection(
        [imageCollection, videoCollection],
        videoCollection.id,
        "video"
      )
    ).toBe(videoCollection)
  })

  it("does not treat an image collection as valid video media", () => {
    const config = {
      ...defaultAutomationSchema(automation),
      video_format: videoAutomationTemplatePreset("ugc_ad").buildFormat(),
    }

    expect(resolveMediaCollection([imageCollection], "photos", "video")).toBe(
      undefined
    )
    expect(automationVideoGenerationIssue(config, [imageCollection], [])).toBe(
      "Choose or create a video collection with at least one video before generating."
    )
  })
})

function collection(
  id: string,
  mediaType: "image" | "video"
): CreatedImageCollection {
  return {
    id,
    title: id,
    mediaType,
    createdAt: "2026-07-15T00:00:00.000Z",
    source: "upload",
    images: [
      {
        id: `${id}-asset`,
        imageUrl: `/media/${id}.mp4`,
        title: id,
        description: "",
        sourceUrl: "",
        dominantColor: "#000000",
      },
    ],
  }
}
