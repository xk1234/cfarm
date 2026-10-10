import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createMemoryRepositories, type Repositories } from "@/lib/data"
import { createLumenClipMcpServer, type LumenClipMcpServices } from "@/lib/mcp/lumenclip-server"
import type { ApiKeyScope } from "@/lib/data/types"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"
import { NotConfiguredPublisher } from "@/lib/publishing/publisher"
import { TINY_PNG, createFakePublisher, createFakeRenderSpec } from "@/lib/renders/test-fakes"
import { createWorker } from "@/lib/jobs/worker"
import { storeMedia } from "@/lib/renders/media"

const WS = "user_mcp"

const clients: Client[] = []
const servers: ReturnType<typeof createLumenClipMcpServer>[] = []
let repos: Repositories
let fake: ReturnType<typeof createFakeRenderSpec>

beforeEach(() => {
  repos = createMemoryRepositories()
  fake = createFakeRenderSpec()
})

afterEach(async () => {
  await Promise.all([
    ...clients.splice(0).map((client) => client.close()),
    ...servers.splice(0).map((server) => server.close()),
  ])
})

async function connect(
  overrides: Partial<LumenClipMcpServices> = {},
  disabledToolNames: string[] = [],
  scopes?: ApiKeyScope[]
) {
  const server = createLumenClipMcpServer(
    WS,
    {
      repositories: () => repos,
      renderSpec: fake.renderSpec,
      publisher: () => new NotConfiguredPublisher(),
      apiBaseUrl: () => "https://app.test/api/v1",
      now: () => new Date("2026-10-09T08:00:00Z"),
      ...overrides,
    },
    { disabledToolNames, apiKeyId: "key-1", scopes }
  )
  const client = new Client({ name: "test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  servers.push(server)
  clients.push(client)
  return client
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  // Tool results are untyped JSON; tests assert on their shape directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result as { isError?: boolean; structuredContent?: Record<string, any>; content: { text: string }[] }
}

const spec = (slides = 2) => ({
  version: 1,
  canvas: { preset: "9:16" },
  slides: Array.from({ length: slides }, (_, i) => ({
    id: `s${i}`,
    layers: [{ id: "t", type: "text", frame: { inset: 40 }, text: "Hello" }],
  })),
})

describe("LumenClip MCP server", () => {
  it("registers exactly the tools in the registry", async () => {
    const client = await connect()
    const names = (await client.listTools()).tools.map((tool) => tool.name)

    expect(names.sort()).toEqual([...LUMENCLIP_MCP_TOOL_NAMES].sort())
    expect(names).not.toContain("lumenclip_slideshow_generate")
    expect(names).not.toContain("lumenclip_workspace_members_list")
  })

  it("removes disabled tools from discovery", async () => {
    const client = await connect({}, ["lumenclip_output_delete"])
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    expect(names).not.toContain("lumenclip_output_delete")
  })

  it("disables tools the API key's scopes do not cover", async () => {
    const client = await connect({}, [], ["renders:read"])
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    expect(names).toContain("lumenclip_render_get")
    expect(names).toContain("lumenclip_outputs_list")
    expect(names).toContain("lumenclip_spec_validate")
    for (const denied of [
      "lumenclip_output_publish",
      "lumenclip_output_delete",
      "lumenclip_collection_delete",
      "lumenclip_collection_add_assets",
      "lumenclip_slideshow_render",
      "lumenclip_templates_list",
      "lumenclip_accounts_list",
      "lumenclip_batch_create",
      "lumenclip_batch_preview",
    ]) {
      expect(names, denied).not.toContain(denied)
    }
    const refused = await callTool(client, "lumenclip_output_publish", { outputId: "r1", accountIds: ["1"] })
    expect(refused.isError).toBe(true)
  })

  it("serves the spec schema, fonts and starter templates", async () => {
    const client = await connect()
    const schema = await callTool(client, "lumenclip_spec_schema_get")
    expect(schema.structuredContent?.schema.$id).toContain("slideshow-spec-v1")

    const fonts = await callTool(client, "lumenclip_fonts_list")
    expect(fonts.structuredContent?.families).toContain("Inter")

    const list = await callTool(client, "lumenclip_templates_list")
    expect(list.structuredContent?.templates.map((t: { id: string }) => t.id)).toContain("starter-listicle")
    const one = await callTool(client, "lumenclip_templates_list", { templateId: "starter-quote-carousel" })
    expect(one.structuredContent?.template.slots).toHaveProperty("quotes")
  })

  it("validates specs with JSON-pointer issues", async () => {
    const client = await connect()
    const ok = await callTool(client, "lumenclip_spec_validate", { spec: spec() })
    expect(ok.structuredContent).toMatchObject({ ok: true, errors: [] })
    const bad = await callTool(client, "lumenclip_spec_validate", { spec: { version: 1, slides: [] } })
    expect(bad.structuredContent?.ok).toBe(false)
    expect(bad.structuredContent?.errors[0].path).toBe("/canvas")
  })

  it("renders a spec inline and reads it back", async () => {
    const client = await connect()
    const rendered = await callTool(client, "lumenclip_slideshow_render", { spec: spec(2), title: "Hello" })
    expect(rendered.isError).toBeFalsy()
    const render = rendered.structuredContent?.render
    expect(rendered.structuredContent?.mode).toBe("sync")
    expect(render).toMatchObject({ status: "succeeded", source: "mcp", slideCount: 2 })
    expect(render.slides[0].url).toBe(`https://app.test/api/v1/renders/${render.id}/slides/0`)

    const got = await callTool(client, "lumenclip_render_get", { renderId: render.id })
    expect(got.structuredContent?.render.resolvedSpec.slides).toHaveLength(2)
    const stored = await repos.renders.get(WS, render.id)
    expect(stored?.apiKeyId).toBe("key-1")
  })

  it("queues large renders and exposes the job as an operation", async () => {
    const client = await connect()
    const rendered = await callTool(client, "lumenclip_slideshow_render", { spec: spec(12) })
    expect(rendered.structuredContent?.mode).toBe("async")
    const jobId = rendered.structuredContent?.jobId
    const op = await callTool(client, "lumenclip_operation_get", { operationId: jobId })
    expect(op.structuredContent?.operation).toMatchObject({ type: "render-slideshow", status: "queued" })
    const ops = await callTool(client, "lumenclip_operations_list")
    expect(ops.structuredContent?.operations).toHaveLength(1)
  })

  it("returns slot errors as a tool error", async () => {
    const client = await connect()
    const result = await callTool(client, "lumenclip_slideshow_render", {
      templateId: "starter-collage",
      slotValues: {},
    })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text).errors.length).toBeGreaterThan(0)
  })

  it("creates, lists and deletes collections", async () => {
    const client = await connect()
    const saved = await callTool(client, "lumenclip_collection_save", { name: "Mystical", requestId: "r1" })
    expect(saved.structuredContent).toMatchObject({ requestId: "r1", created: true, collection: { name: "Mystical" } })
    const again = await callTool(client, "lumenclip_collection_save", { name: "Mystical" })
    expect(again.structuredContent?.created).toBe(false)

    const id = saved.structuredContent?.collection.id
    const list = await callTool(client, "lumenclip_collections_list")
    expect(list.structuredContent?.collections).toHaveLength(1)

    const deleted = await callTool(client, "lumenclip_collection_delete", { collectionId: id, confirm: true })
    expect(deleted.structuredContent?.deleted).toBe(true)
    expect((await callTool(client, "lumenclip_collections_list")).structuredContent?.collections).toHaveLength(0)
  })

  it("imports URL images into a collection through the guarded fetcher", async () => {
    const fetched: string[] = []
    const client = await connect({
      remoteFetch: {
        guard: async (url) => {
          if (url.includes("10.0.0.1")) throw new Error("private address")
        },
        fetch: async (url) => {
          fetched.push(url)
          return new Response(TINY_PNG, { headers: { "content-type": "image/png" } })
        },
      },
    })
    const saved = await callTool(client, "lumenclip_collection_save", { name: "Imports" })
    const id = saved.structuredContent?.collection.id
    const result = await callTool(client, "lumenclip_collection_add_assets", {
      collectionId: id,
      urls: ["https://images.example/a.png", "http://10.0.0.1/secret.png"],
    })
    expect(result.structuredContent?.added).toHaveLength(1)
    expect(result.structuredContent?.failed[0].url).toBe("http://10.0.0.1/secret.png")
    expect(fetched).toEqual(["https://images.example/a.png"])

    const assets = await callTool(client, "lumenclip_assets_list", { collectionId: id })
    expect(assets.structuredContent?.assets).toHaveLength(1)
  })

  it('reports "SocialBu not connected" for publishing without a token', async () => {
    const client = await connect()
    const accounts = await callTool(client, "lumenclip_accounts_list")
    expect(accounts.structuredContent).toMatchObject({ connected: false, message: "SocialBu not connected" })
    const rendered = await callTool(client, "lumenclip_slideshow_render", { spec: spec(1) })
    const publish = await callTool(client, "lumenclip_output_publish", {
      outputId: rendered.structuredContent?.render.id,
      accountIds: ["101"],
    })
    expect(publish.isError).toBe(true)
    expect(publish.content[0].text).toContain("SocialBu not connected")
  })

  it("schedules a render through the publisher and shows it on the schedule", async () => {
    const fakePublisher = createFakePublisher()
    const client = await connect({ publisher: () => fakePublisher.publisher })
    const rendered = await callTool(client, "lumenclip_slideshow_render", { spec: spec(2), title: "Deck" })
    const outputId = rendered.structuredContent?.render.id
    const publish = await callTool(client, "lumenclip_output_publish", {
      outputId,
      accountIds: ["101"],
      caption: "Hi",
      publishAt: "2026-10-10T18:00:00+00:00",
    })
    expect(publish.structuredContent?.posts[0]).toMatchObject({ status: "scheduled", accountId: "101" })
    expect(fakePublisher.uploads).toHaveLength(2)

    const schedule = await callTool(client, "lumenclip_schedule_get", { days: 7 })
    expect(schedule.structuredContent?.items).toHaveLength(1)
    expect(schedule.structuredContent?.items[0].renderTitle).toBe("Deck")

    const blocked = await callTool(client, "lumenclip_output_delete", { outputId, confirm: true })
    expect(blocked.isError).toBe(true)
  })

  it("records manual publications", async () => {
    const client = await connect()
    const rendered = await callTool(client, "lumenclip_slideshow_render", { spec: spec(1) })
    const outputId = rendered.structuredContent?.render.id
    const marked = await callTool(client, "lumenclip_output_mark_published", {
      outputId,
      provider: "tiktok",
      permalink: "https://www.tiktok.com/@me/photo/1",
    })
    expect(marked.structuredContent?.post).toMatchObject({ status: "published", provider: "tiktok" })
    const output = await callTool(client, "lumenclip_output_get", { outputId })
    expect(output.structuredContent?.posts).toHaveLength(1)
  })

  it("previews, creates, reads, lists and cancels carousel batches", async () => {
    const now = () => new Date("2026-10-09T08:00:00Z")
    const fakePublisher = createFakePublisher()
    const collection = await repos.collections.create(WS, { name: "Sunsets", createdBy: WS })
    for (let i = 0; i < 2; i++) {
      await storeMedia(repos, WS, { bytes: new Uint8Array([...TINY_PNG, i]), mime: "image/png", collectionId: collection.id, source: "upload", createdBy: WS })
    }
    let kicks = 0
    const client = await connect({ publisher: () => fakePublisher.publisher, now, kickJobs: () => void kicks++ })
    const input = {
      templateId: "starter-photo-pill",
      items: [
        { slotValues: { slides: [{ image: { collection: "Sunsets", pick: "random" }, caption: "A" }] }, caption: "a" },
        { slotValues: { slides: [{ image: { collection: "Sunsets", pick: "random" }, caption: "B" }] }, caption: "b" },
      ],
      schedule: { accountIds: ["101", "202"], timezone: "UTC", startDate: "2026-10-12", jitterMinutes: 0 },
    }
    const preview = await callTool(client, "lumenclip_batch_preview", input)
    expect(preview.structuredContent?.preview.ok).toBe(true)
    expect(preview.structuredContent?.preview.items.map((i: { accountId: string }) => i.accountId)).toEqual(["101", "202"])

    const invalid = await callTool(client, "lumenclip_batch_create", { ...input, items: [{ slotValues: {} }] })
    expect(invalid.isError).toBe(true)
    expect(invalid.content[0]!.text).toContain("/items/0/slotValues")

    const created = await callTool(client, "lumenclip_batch_create", { ...input, idempotencyKey: "mcp-1" })
    expect(created.structuredContent?.created).toBe(true)
    expect(kicks).toBe(1)
    const batchId = created.structuredContent?.batch.id
    const worker = createWorker({ repos, workerId: "t", log: { info() {}, warn() {}, error() {} }, publisher: fakePublisher.publisher, renderSpec: fake.renderSpec })
    for (let i = 0; i < 30; i++) if ((await worker.tick()).claimed === 0) break

    const got = await callTool(client, "lumenclip_batch_get", { batchId })
    expect(got.structuredContent?.batch.status).toBe("completed")
    expect(fakePublisher.posts.map((p) => p.publishAt)).toEqual(["2026-10-12T09:00:00.000Z", "2026-10-12T09:00:00.000Z"])
    const list = await callTool(client, "lumenclip_batches_list")
    expect(list.structuredContent?.batches).toHaveLength(1)

    const canceled = await callTool(client, "lumenclip_batch_cancel", { batchId })
    // The fake publisher cannot delete posts, so both are reported as failures.
    expect(canceled.structuredContent?.failures).toHaveLength(2)
    const retry = await callTool(client, "lumenclip_batch_retry", { batchId })
    expect(retry.isError).toBe(true)
    expect((await callTool(client, "lumenclip_batch_get", { batchId: "nope" })).isError).toBe(true)
  })
})
