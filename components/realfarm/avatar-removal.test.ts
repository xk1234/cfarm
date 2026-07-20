import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (file: string) => readFileSync(path.join(root, file), "utf8")

describe("AI UGC avatar feature removal", () => {
  it("does not expose the avatar workspace view", () => {
    const navigation = source("components/realfarm/navigation.tsx")
    const workspace = source("components/realfarm-workspace.tsx")

    expect(navigation).not.toContain('"avatars"')
    expect(navigation).not.toContain("AI UGC avatars")
    expect(workspace).not.toContain("AvatarsView")
    expect(workspace).not.toContain('view === "avatars"')
  })

  it("does not retain avatar routes, components, or character stores", () => {
    expect(existsSync(path.join(root, "app/api/characters"))).toBe(false)
    expect(existsSync(path.join(root, "components/realfarm/characters"))).toBe(
      false
    )
    expect(existsSync(path.join(root, "lib/characters.ts"))).toBe(false)
    expect(existsSync(path.join(root, "lib/kie-video.ts"))).toBe(false)

    const stores = source("lib/appwrite-stores.ts")
    expect(stores).not.toContain('"characters.json"')
    expect(stores).not.toContain('"characters/images.json"')
    expect(stores).not.toContain('"characters/videos.json"')
  })

  it("keeps uploaded UGC talking-head videos available to automations", () => {
    const workspace = source("components/realfarm-workspace.tsx")
    const mediaLibrary = source("lib/media-library.ts")

    expect(workspace).toContain("ugcAvatarVideoCollectionFromAssets")
    expect(mediaLibrary).toContain('"ugc_avatar_videos"')
  })
})
