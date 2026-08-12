import { Query } from "node-appwrite"
import { describe, expect, it } from "vitest"

import { buildListRowsQuery } from "@/lib/railway/appwrite-compat"

describe("buildListRowsQuery", () => {
  it("pushes filters, ordering, cursor, offset, and limit into PostgreSQL", () => {
    const queries = [
      Query.equal("owner_id", ["owner-1"]),
      Query.equal("status", ["ready", "queued"]),
      Query.notEqual("type", ["sync-post-analytics"]),
      Query.lessThanEqual("available_at", "2026-08-12T12:00:00.000Z"),
      Query.orderDesc("priority"),
      Query.orderAsc("available_at"),
      Query.cursorAfter("job-20"),
      Query.offset(5),
      Query.limit(10),
    ]

    const built = buildListRowsQuery(
      "jobs",
      queries.map((query) => JSON.parse(query))
    )

    expect(built.text).toContain("WITH filtered AS")
    expect(built.text).toContain("safe_numeric")
    expect(built.text).toContain("row_number() OVER")
    expect(built.text).toContain("sort_position FROM ranked WHERE row_id")
    expect(built.text).toContain("OFFSET")
    expect(built.text).toContain("LIMIT")
    expect(built.parameters).toContain("jobs")
    expect(built.parameters).toContain("job-20")
    expect(built.parameters).toContain(5)
    expect(built.parameters).toContain(10)
  })

  it("caps compatibility pages to a bounded result size", () => {
    const built = buildListRowsQuery("outputs", [
      JSON.parse(Query.limit(100_000)),
    ])

    expect(built.parameters.at(-1)).toBe(5_000)
  })
})
