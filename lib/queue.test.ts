import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  deleteAutomationJobs,
  enqueueJob,
  retryGenerationJob,
} from "@/lib/queue"
import { getRailwayOrm } from "@/lib/railway/database"
import { jobs } from "@/lib/railway/schema"

const ownerId = "vitest-user"

async function seedJob(input: {
  id: string
  ownerId: string
  automationId: string
  status?: "queued" | "failed" | "dead"
}) {
  await getRailwayOrm()
    .insert(jobs)
    .values({
      id: input.id,
      ownerId: input.ownerId,
      jobType: "run-automation",
      status: input.status ?? "failed",
      payload: { automationId: input.automationId },
      error: input.status === "queued" ? null : "Provider returned error",
    })
}

async function clearJobs() {
  await getRailwayOrm()
    .delete(jobs)
    .where(inArray(jobs.ownerId, [ownerId, "owner-2"]))
}

beforeEach(clearJobs)
afterAll(clearJobs)

describe("PostgreSQL generation queue", () => {
  it("deletes only generation jobs belonging to the automation", async () => {
    await seedJob({
      id: "job-delete",
      ownerId,
      automationId: "automation-1",
    })
    await seedJob({
      id: "job-keep",
      ownerId,
      automationId: "automation-2",
    })

    const deleted = await deleteAutomationJobs("automation-1")

    expect(deleted.map((job) => job.id)).toEqual(["job-delete"])
    const remaining = await getRailwayOrm()
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.ownerId, ownerId))
    expect(remaining.map((job) => job.id)).toEqual(["job-keep"])
  })

  it("requeues an owned dead generation and resets its attempt budget", async () => {
    await enqueueJob({
      type: "run-automation",
      dedupeKey: "retry-test",
      payload: { automationId: "automation-1" },
    })
    const [job] = await getRailwayOrm()
      .select()
      .from(jobs)
      .where(eq(jobs.ownerId, ownerId))
    if (!job) throw new Error("Seeded job was not found")
    await getRailwayOrm()
      .update(jobs)
      .set({
        status: "dead",
        attempts: 3,
        result: { partial: true },
        error: "Provider returned error",
      })
      .where(eq(jobs.id, job.id))

    const result = await retryGenerationJob(job.id)

    expect(result).toEqual(
      expect.objectContaining({
        retried: true,
        job: expect.objectContaining({
          id: job.id,
          status: "queued",
          attempts: 0,
          error: null,
          result: null,
        }),
      })
    )
  })

  it("does not retry a job owned by another user", async () => {
    await seedJob({
      id: "job-other-owner",
      ownerId: "owner-2",
      automationId: "automation-1",
      status: "dead",
    })

    await expect(retryGenerationJob("job-other-owner")).resolves.toBeNull()
  })
})
