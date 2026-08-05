import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildPublicationRecord,
  publicationRecordContractFixture,
  validatePublicationRecord,
} from "./publishing-core.js"

const serialized = (value) => JSON.parse(JSON.stringify(value))

describe("generated worker publication record contract", () => {
  for (const fixture of publicationRecordContractFixture.cases) {
    it(fixture.name, () => {
      const record = serialized(buildPublicationRecord(fixture.input))
      assert.deepEqual(record, fixture.expected)
      assert.deepEqual(validatePublicationRecord(record), [])
    })
  }

  it("rejects the old incomplete UGC publication", () => {
    const errors = validatePublicationRecord({
      integrationId: "integration-1",
      provider: "tiktok",
      status: "scheduled",
      updatedAt: "2026-07-30T08:00:00.000Z",
    })
    assert.ok(errors.includes("missing required field: id"))
    assert.ok(errors.includes("missing required field: sourceType"))
    assert.ok(errors.includes("missing required field: sourceId"))
  })
})
