import { describe, expect, it } from "vitest"

import type { PostFastPostRecord } from "@/lib/postfast-posts"
import {
  lifecycleFromPostFastStatus,
  normalizePost,
  postFromPostFastRecord,
  postIdentityClaims,
  postToPostFastRecord,
} from "@/lib/posts"

describe("canonical posts", () => {
  it("normalizes an external post that has no generated output", () => {
    const post = normalizePost({
      schemaVersion: 1,
      id: "external-1",
      intentId: "analytics:external-1",
      ownerId: "owner-1",
      origin: "postfast_sync",
      sourceType: "external",
      sourceId: "native-1",
      sourceRefs: [{ kind: "external", id: "native-1" }],
      lifecycleStatus: "published",
      linkState: "externally_linked",
      linkMethod: "analytics_sync",
      integrationId: "integration-1",
      provider: "TIKTOK",
      externalPostId: "native-1",
      statsSources: ["postfast"],
      content: "Imported directly from analytics",
      hashtags: [],
      media: [],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    })

    expect(post).toMatchObject({
      id: "external-1",
      provider: "tiktok",
      lifecycleStatus: "published",
      sourceRefs: [{ kind: "external", id: "native-1" }],
    })
    expect(post?.outputId).toBeUndefined()
    expect(post?.automationId).toBeUndefined()
  })

  it("maps legacy lifecycle and link states in both directions", () => {
    const record: PostFastPostRecord = {
      id: "publication-1",
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      integrationId: "integration-1",
      provider: "tiktok",
      status: "ready_for_review",
      linkState: "postfast_published",
      statsSources: [],
      content: "Review me",
      media: [{ key: "image-1", type: "IMAGE", sortOrder: 0 }],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    }

    const post = postFromPostFastRecord(record, "owner-1")
    expect(post).toMatchObject({
      lifecycleStatus: "ready",
      publishMode: "review",
      linkState: "postfast_managed",
      sourceRefs: [{ kind: "slideshow", id: "slideshow-1" }],
    })
    expect(postToPostFastRecord(post)).toMatchObject({
      id: record.id,
      status: "ready_for_review",
      linkState: "postfast_published",
      media: record.media,
    })
    expect(lifecycleFromPostFastStatus("awaiting_manual_post")).toEqual({
      lifecycleStatus: "ready",
      publishMode: "manual",
    })
  })

  it("scopes remote identities by owner, provider, and integration", () => {
    const first = postIdentityClaims({
      ownerId: "owner-1",
      integrationId: "account-1",
      provider: "twitter",
      externalPostId: "status-42",
    })
    const providerAlias = postIdentityClaims({
      ownerId: "owner-1",
      integrationId: "account-1",
      provider: "x",
      externalPostId: "status-42",
    })
    const otherIntegration = postIdentityClaims({
      ownerId: "owner-1",
      integrationId: "account-2",
      provider: "x",
      externalPostId: "status-42",
    })

    expect(first).toEqual(providerAlias)
    expect(first).not.toEqual(otherIntegration)
  })
})
