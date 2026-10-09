import { getTableColumns, getTableName } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { appUsers, domainRecords, jobs } from "@/lib/railway/schema"

describe("Railway Drizzle schema", () => {
  it("maps the cutover tables and their stable database column names", () => {
    expect(getTableName(appUsers)).toBe("app_users")
    expect(getTableName(domainRecords)).toBe("domain_records")
    expect(getTableName(jobs)).toBe("jobs")
    expect(getTableColumns(jobs).jobType.name).toBe("job_type")
    expect(getTableColumns(domainRecords).ownerId.name).toBe("owner_id")
  })
})
