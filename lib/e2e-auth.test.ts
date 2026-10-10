import { describe, expect, it } from "vitest"

import { e2eAuthUserId, e2eUser, isE2eAuthEnabled } from "./e2e-auth"

const on = {
  NODE_ENV: "development",
  LUMENCLIP_DATA_BACKEND: "memory",
  LUMENCLIP_E2E_USER_ID: "user_e2e",
}

describe("e2e auth seam", () => {
  it("is on only when every condition holds", () => {
    expect(e2eAuthUserId(on)).toBe("user_e2e")
    expect(isE2eAuthEnabled({ ...on, NODE_ENV: "test" })).toBe(true)
    expect(isE2eAuthEnabled({ ...on, NODE_ENV: undefined })).toBe(true)
    expect(e2eUser(on)).toMatchObject({ id: "user_e2e" })
  })

  it("is off in production even with the user id set", () => {
    expect(e2eAuthUserId({ ...on, NODE_ENV: "production" })).toBeNull()
    expect(e2eUser({ ...on, NODE_ENV: "production" })).toBeNull()
  })

  it("is off on the appwrite backend even with the user id set", () => {
    expect(e2eAuthUserId({ ...on, LUMENCLIP_DATA_BACKEND: "appwrite" })).toBeNull()
    expect(e2eAuthUserId({ ...on, LUMENCLIP_DATA_BACKEND: undefined })).toBeNull()
    expect(e2eAuthUserId({ ...on, LUMENCLIP_DATA_BACKEND: "" })).toBeNull()
  })

  it("is off without a user id", () => {
    expect(e2eAuthUserId({ ...on, LUMENCLIP_E2E_USER_ID: undefined })).toBeNull()
    expect(e2eAuthUserId({ ...on, LUMENCLIP_E2E_USER_ID: "  " })).toBeNull()
  })
})
