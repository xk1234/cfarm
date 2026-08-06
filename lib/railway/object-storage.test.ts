import { describe, expect, it } from "vitest"

import { railwayObjectKey } from "@/lib/railway/object-storage"

describe("Railway object identity", () => {
  it("preserves Appwrite bucket and file IDs in one private bucket", () => {
    expect(railwayObjectKey("image_collections", "hero/a b.png")).toBe(
      "appwrite/image_collections/hero%2Fa%20b.png"
    )
  })
})
