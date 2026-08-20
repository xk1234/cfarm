import { describe, expect, it } from "vitest"

import { RecordQuery } from "@/lib/record-query"

describe("RecordQuery", () => {
  it("keeps the persisted query wire format stable", () => {
    expect(RecordQuery.equal("owner_id", ["owner-1"])).toBe(
      '{"method":"equal","attribute":"owner_id","values":["owner-1"]}'
    )
    expect(RecordQuery.orderDesc("priority")).toBe(
      '{"method":"orderDesc","attribute":"priority"}'
    )
    expect(RecordQuery.limit(25)).toBe('{"method":"limit","values":[25]}')
  })
})
