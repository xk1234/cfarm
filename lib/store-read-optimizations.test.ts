import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  deleteAutomationRuns,
  getAutomationRunForSlideshow,
  updateAutomationRunMetadata,
} from "@/lib/automation-runner"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import { clearTestTables } from "@/lib/test-helpers"

const clearStores = () =>
  clearTestTables("automations", "x_automations", "automation_runs")

beforeEach(clearStores)
afterAll(clearStores)

describe("bounded Appwrite store access", () => {
  it("reads, updates, and deletes an automation run by deterministic id", async () => {
    const run = {
      id: "run-direct-1",
      automationId: "automation-direct-1",
      automationTitle: "Direct run",
      scheduledFor: "2026-07-17T08:00:00.000Z",
      status: "succeeded",
      slideshowId: "slideshow-direct-1",
      plan: {
        title: "Direct run",
        caption: "Caption",
        hashtags: "#direct",
        hook: "Hook",
        imageCollectionIds: [],
        slides: [],
        slideCount: { mode: "static", count: 1 },
        publishType: "slideshow",
        autoMusic: true,
        autoPost: false,
        language: "English",
      },
      createdAt: "2026-07-17T08:00:00.000Z",
      updatedAt: "2026-07-17T08:00:00.000Z",
    }
    const rootDir = `${process.cwd()}/data/automations`
    await writeJsonArrayStore({
      rootDir,
      fileName: "runs.json",
      key: "runs",
      records: [run],
    })

    await expect(
      getAutomationRunForSlideshow({
        runRootDir: rootDir,
        runId: run.id,
        slideshowId: run.slideshowId,
      })
    ).resolves.toMatchObject({ id: run.id })
    await expect(
      updateAutomationRunMetadata({
        runRootDir: rootDir,
        runId: run.id,
        slideshowId: run.slideshowId,
        title: "Updated directly",
        caption: "Updated caption",
        hashtags: "#updated",
      })
    ).resolves.toMatchObject({ plan: { title: "Updated directly" } })
    await expect(
      deleteAutomationRuns({ runRootDir: rootDir, runIds: [run.id] })
    ).resolves.toHaveLength(1)
    await expect(
      readJsonArrayStore({
        rootDir,
        fileName: "runs.json",
        key: "runs",
      })
    ).resolves.toEqual([])
  })
})
