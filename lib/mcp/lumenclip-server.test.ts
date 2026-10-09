import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import {
  createLumenClipMcpServer,
  type LumenClipMcpServices,
} from "@/lib/mcp/lumenclip-server"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"

const OWNER = "user_mcp"
const clients: Client[] = []
const servers: ReturnType<typeof createLumenClipMcpServer>[] = []
let repos: Repositories

beforeEach(() => {
  repos = resetMemoryRepositories()
})

afterEach(async () => {
  await Promise.all([
    ...clients.splice(0).map((client) => client.close()),
    ...servers.splice(0).map((server) => server.close()),
  ])
})

async function connectClient(
  overrides: Partial<LumenClipMcpServices> = {},
  options: { disabledToolNames?: string[] } = {}
) {
  const server = createLumenClipMcpServer(OWNER, overrides, options)
  const client = new Client({ name: "test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  clients.push(client)
  servers.push(server)
  return client
}

describe("LumenClip MCP server", () => {
  it("registers exactly the tools in the registry", async () => {
    const client = await connectClient()
    const toolNames = (await client.listTools()).tools.map((tool) => tool.name)
    expect(toolNames.sort()).toEqual([...LUMENCLIP_MCP_TOOL_NAMES].sort())
  })

  it("removes disabled APIs from MCP discovery", async () => {
    const client = await connectClient({}, { disabledToolNames: ["lumenclip_collection_delete"] })
    const toolNames = (await client.listTools()).tools.map((tool) => tool.name)
    expect(toolNames).not.toContain("lumenclip_collection_delete")
  })

  it("creates, lists and soft-deletes collections in the caller's workspace", async () => {
    const client = await connectClient({ now: () => new Date("2026-10-09T12:00:00.000Z") })

    const saved = await client.callTool({
      name: "lumenclip_collection_save",
      arguments: { name: "Mystical Pictures", mediaType: "image", requestId: "c-1" },
    })
    expect(saved.structuredContent).toMatchObject({
      created: true,
      collection: { name: "Mystical Pictures", mediaType: "image", itemCount: 0 },
    })
    expect((await repos.collections.getByName(OWNER, "Mystical Pictures"))?.workspaceId).toBe(OWNER)
    expect(await repos.collections.getByName("someone_else", "Mystical Pictures")).toBeNull()

    const listed = await client.callTool({ name: "lumenclip_collections_list", arguments: { query: "mystic" } })
    expect(listed.structuredContent).toMatchObject({ total: 1, items: [{ name: "Mystical Pictures" }] })

    const collectionId = (saved.structuredContent as { collection: { id: string } }).collection.id
    const deleted = await client.callTool({
      name: "lumenclip_collection_delete",
      arguments: { collectionId, requestId: "d-1", confirmDelete: true },
    })
    expect(deleted.structuredContent).toMatchObject({ alreadyDeleted: false })
    expect((await repos.collections.getByName(OWNER, "Mystical Pictures"))?.deletedAt).toBeTruthy()
  })

  it("imports assets into an existing collection through the guarded importer", async () => {
    await repos.collections.create(OWNER, { name: "Charts", createdBy: OWNER })
    const importRemote = vi.fn<LumenClipMcpServices["importRemoteImagesToCollection"]>(async (_ws, input) => ({
      collection: {
        name: input.collectionName ?? "",
        created_at: "2026-10-09T12:00:00.000Z",
        images: [{ image_link: "/api/files/media/f1", caption: "Chart" }],
      },
      imported: 1,
    }))
    const client = await connectClient({ importRemoteImagesToCollection: importRemote })
    const result = await client.callTool({
      name: "lumenclip_collection_add_assets",
      arguments: {
        collectionId: "Charts",
        assets: [{ httpsUrl: "https://images.example.com/chart.png", caption: "Chart" }],
        requestId: "a-1",
      },
    })
    expect(importRemote).toHaveBeenCalledWith(OWNER, expect.objectContaining({ collectionName: "Charts" }))
    expect(result.structuredContent).toMatchObject({ added: 1, duplicates: 0 })
  })

  it("lists uploads-library assets", async () => {
    const client = await connectClient({
      listAssetRecords: vi.fn(async () => [
        {
          id: "m1",
          kind: "image" as const,
          source: "upload" as const,
          status: "ready" as const,
          scope: "global" as const,
          name: "Kitchen",
          caption: "",
          createdAt: "2026-10-09T12:00:00.000Z",
          updatedAt: "2026-10-09T12:00:00.000Z",
        },
      ]),
    })
    const result = await client.callTool({ name: "lumenclip_assets_list", arguments: { query: "kitch" } })
    expect(result.structuredContent).toMatchObject({ total: 1, items: [{ id: "m1", recordType: "asset_record" }] })
  })
})
