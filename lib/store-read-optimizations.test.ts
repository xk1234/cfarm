import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createLocalAutomationRecord,
  deleteAutomationRecord,
  getAutomationRecord,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import {
  deleteKnowledgeBase,
  getKnowledgeBase,
  upsertKnowledgeBase,
} from "@/lib/knowledge-bases"
import { clearTestTables } from "@/lib/test-helpers"
import {
  createXAutomation,
  deleteXAutomation,
  getXAutomation,
} from "@/lib/x-automation-store"

const clearStores = () =>
  clearTestTables("automations", "knowledge_bases", "x_automations")

beforeEach(clearStores)
afterAll(clearStores)

describe("bounded Appwrite store access", () => {
  it("reads, patches, and deletes one automation by deterministic row id", async () => {
    const automation = createLocalAutomationRecord({ name: "Direct read" })
    await upsertAutomationRecords({ records: [automation] })

    await expect(getAutomationRecord(automation.id)).resolves.toMatchObject({
      id: automation.id,
      name: "Direct read",
    })
    await expect(
      patchAutomationRecord({ id: automation.id, name: "Patched directly" })
    ).resolves.toMatchObject({ name: "Patched directly" })
    await expect(
      deleteAutomationRecord({ id: automation.id })
    ).resolves.toMatchObject({ id: automation.id })
  })

  it("upserts and deletes a knowledge base without rewriting its table", async () => {
    const created = await upsertKnowledgeBase({
      id: "kb-direct-read",
      name: "Direct KB",
      description: "",
      status: "idle",
      sources: [],
      compiledText: "",
    })

    await expect(getKnowledgeBase(created.id)).resolves.toMatchObject({
      id: created.id,
      name: "Direct KB",
    })
    await expect(deleteKnowledgeBase(created.id)).resolves.toMatchObject({
      id: created.id,
    })
  })

  it("uses direct record operations for X automations", async () => {
    const automation = await createXAutomation({ name: "Direct X" })
    await expect(getXAutomation(automation.id)).resolves.toMatchObject({
      id: automation.id,
      name: "Direct X",
    })
    await expect(deleteXAutomation(automation.id)).resolves.toMatchObject({
      id: automation.id,
    })
  })
})
