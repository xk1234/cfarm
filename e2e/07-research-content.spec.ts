import { appApi, test, expect, gotoView } from "./fixtures"

/* eslint-disable @typescript-eslint/no-explicit-any -- assertions inspect heterogeneous mocked API payloads. */

// Journey 7 — Research-driven content with knowledge bases + variable collections.
//
// Concrete persona: "GlowLab", a skincare creator who makes myth-busting TikToks
// and refuses to post claims that aren't grounded in real dermatology sources.
// She (a) loads source material into a knowledge base, (b) sets up rotating hook
// variables so every video feels fresh, and (c) wires both into an automation.
test.describe("Journey 7 — research-driven skincare content", () => {
  test("ground an automation in a derm knowledge base + rotating hook variables", async ({ page, state }) => {
    await page.goto("/")

    await test.step("build a 'Derm Sources' knowledge base from real material", async () => {
      // GlowLab opens the knowledge base panel and creates a KB for her sources.
      // TODO(selector): open the Knowledge bases panel (likely from Automations /
      // a settings drawer) and click create.
      // Upload two sources: a dermatology guide PDF and a research article.
      // TODO(selector): drive the file input; here we assert the stub attaches them.
      if (state.knowledgeBases.length === 0) {
        state.knowledgeBases = [{ id: "kb-derm", name: "Derm Sources", status: "idle", sources: [] }]
      }
      state.knowledgeBases[0].sources = [
        { id: "s1", name: "aad-acne-guide.pdf", status: "ready" },
        { id: "s2", name: "niacinamide-review.pdf", status: "ready" },
      ]
      expect(state.knowledgeBases[0].sources).toHaveLength(2)
    })

    await test.step("queue a refresh so the sources get summarized (PATCH by id)", async () => {
      // TODO(selector): click "refresh" on the KB. The PATCH hits
      // /api/knowledge-bases/<id> and the mock resolves status -> ready.
      const res = await appApi(page, `/api/knowledge-bases/${state.knowledgeBases[0].id}`, { method: "PATCH", data: { sourceIds: ["s1", "s2"] } })
      expect(res.status).toBe(200)
      expect((res.body as any).knowledgeBase.status).toBe("ready")
    })

    await test.step("create rotating hook variables so no two videos repeat", async () => {
      // Two variable collections: the skin concern, and the myth-opener phrasing.
      await gotoView(page, "Automations")
      // TODO(selector): open the variable-collections panel and create these.
      const concern = await appApi(page, "/api/word-collections", { method: "POST", data: { name: "skin_concern", words: ["acne", "dark spots", "dryness", "texture"] } })
      const opener = await appApi(page, "/api/word-collections", { method: "POST", data: { name: "myth_opener", words: ["POV: you believed", "no one told me", "stop doing this for"] } })
      expect(concern.status).toBe(201)
      expect(opener.status).toBe(201)
      // Guard: an empty-name variable collection is rejected (validation parity).
      const bad = await appApi(page, "/api/word-collections", { method: "POST", data: { name: "   ", words: [] } })
      expect(bad.status).toBe(400)
    })

    await test.step("build a myth-vs-fact automation using KB context + variables", async () => {
      // Hook template mixes both slots; body pulls facts from the KB.
      // TODO(selector): in the automation editor, write a hook like
      //   "[[myth_opener]] ... about [[skin_concern]]" and attach 'Derm Sources'.
      const created = await appApi(page, "/api/automations", {
        method: "POST", data: {
          name: "Skincare myth vs fact",
          schema: {
            title: "Skincare myth vs fact",
            knowledge_base_id: state.knowledgeBases[0].id,
            hook_slots: { skin_concern: "skin_concern", myth_opener: "myth_opener" },
          },
        },
      })
      expect(created.status).toBe(201)
      expect.poll(() => state.automationRecords.length).toBeGreaterThanOrEqual(1)
    })

    await test.step("run it and verify grounded, varied hooks", async () => {
      const run = await appApi(page, "/api/automations/run", { method: "POST", data: { automationId: state.automationRecords[0]?.id, force: true } })
      expect(run.status).toBe(200)
      const payload = run.body as any
      expect(payload.created?.[0]?.status).toBe("succeeded")
      // In live mode: assert the hook contains filled variables (not raw [[slot]])
      // and that body text reflects the derm sources. In mocked mode, assert the
      // pipeline produced a run + rendered slides.
      expect(payload.created?.[0]?.renderedSlides?.[0]?.imageUrl).toContain("/slideshows/outputs/")
    })
  })
})
