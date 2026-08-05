import { describe, expect, it } from "vitest"

import {
  buildPublicationRecord,
  publicationRecordContractFixture,
  type PublicationRecordInput,
  validatePublicationRecord,
} from "@/lib/publication-record"

const serialized = (value: unknown) => JSON.parse(JSON.stringify(value))

describe("shared publication record contract", () => {
  it.each(publicationRecordContractFixture.cases)(
    "builds and validates $name",
    ({ input, expected }) => {
      const record = buildPublicationRecord(input as PublicationRecordInput)

      expect(serialized(record)).toEqual(expected)
      expect(validatePublicationRecord(serialized(record))).toEqual([])
    }
  )

  it("rejects the incomplete shape previously written by the UGC worker", () => {
    expect(
      validatePublicationRecord({
        integrationId: "integration-1",
        provider: "tiktok",
        status: "scheduled",
        scheduledAt: "2026-07-30T09:00:00.000Z",
        postfastPostId: "postfast-1",
        updatedAt: "2026-07-30T08:00:00.000Z",
      })
    ).toEqual(
      expect.arrayContaining([
        "missing required field: id",
        "missing required field: sourceType",
        "missing required field: sourceId",
        "missing required field: content",
        "missing required field: media",
        "missing required field: createdAt",
      ])
    )
  })
})
