import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createSlideshowRecord,
  deleteSlideshowRecord,
  listSlideshowRecords,
} from "@/lib/slideshows"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-slideshows-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("slideshow persistence", () => {
  it("persists generated slides with render settings and text geometry", async () => {
    const record = await createSlideshowRecord({
      rootDir,
      title: "New Slideshow",
      prompt: "I want 12 slides about discipline",
      image_collection: "community_collection_12470",
      slideshow_type: "educational",
      settings: {
        duration: 4,
        background_color: "#000000",
        is_bg_overlay_on: false,
        transition_style: "hard",
        background_opacity: 40,
        is_bg_overlay_on_hook_image: false,
      },
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          aspect_ratio: "4:5",
          time_length_ms: 2000,
          textItems: [
            {
              id: "text-1",
              text: "WAIT. you're giving up???",
              font: "TikTok Display Medium",
              fontSize: "10px",
              textSize: { width: 80, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 16 },
            },
          ],
        },
      ],
    })

    const records = await listSlideshowRecords({ rootDir })

    expect(record).toMatchObject({
      title: "New Slideshow",
      status: "draft",
      prompt: "I want 12 slides about discipline",
      image_collection: "community_collection_12470",
      slideshow_type: "educational",
      is_finished: true,
      is_failed: false,
      settings: {
        duration: 4,
        transition_style: "hard",
      },
    })
    expect(records).toHaveLength(1)
    expect(records[0].images[0]).toMatchObject({
      image_url: "/api/local-assets/image-collections/files/first.jpg",
      aspect_ratio: "4:5",
      time_length_ms: 2000,
      textItems: [
        {
          text: "WAIT. you're giving up???",
          fontSize: "10px",
          textStyle: "outline",
          textPosition: { x: 50, y: 16 },
        },
      ],
    })
  })

  it("deletes slideshow records by id", async () => {
    const record = await createSlideshowRecord({
      rootDir,
      title: "Delete me",
      prompt: "delete prompt",
      images: [],
    })

    const deleted = await deleteSlideshowRecord({ rootDir, id: record.id })
    const records = await listSlideshowRecords({ rootDir })

    expect(deleted?.id).toBe(record.id)
    expect(records).toEqual([])
  })

  it("persists video export settings with selected TikTok sound metadata", async () => {
    const record = await createSlideshowRecord({
      rootDir,
      title: "Video slideshow",
      settings: {
        duration: 3,
        transition_style: "fade",
        export_as_video: true,
        sound_id: "sound-123",
        sound_name: "TikTok trend sound",
        sound_url: "/api/local-assets/music/files/trend.mp3",
      },
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/slide.jpg",
        },
      ],
    })

    expect(record.settings).toMatchObject({
      duration: 3,
      transition_style: "fade",
      export_as_video: true,
      sound_id: "sound-123",
      sound_name: "TikTok trend sound",
      sound_url: "/api/local-assets/music/files/trend.mp3",
    })
    expect(record.images[0].time_length_ms).toBe(3000)
  })
})
