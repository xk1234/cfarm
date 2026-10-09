import { beforeEach, describe, expect, it } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import { emitNotification } from "@/lib/notifications"

import { PATCH } from "./[id]/route"
import { POST as readAll } from "./read-all/route"
import { GET } from "./route"

const WS = "vitest-user"
let repos: Repositories

beforeEach(() => {
  repos = resetMemoryRepositories()
})

async function inbox(query = "") {
  const response = await GET(new Request(`http://localhost/api/notifications${query}`), undefined)
  return (await response.json()) as { items: Array<{ id: string; status: string }>; unreadCount: number }
}

describe("/api/notifications", () => {
  it("lists, marks one read and marks all read", async () => {
    const first = await emitNotification(WS, { event: "render.succeeded", title: "A", dedupeKey: "a" }, { repos })
    await emitNotification(WS, { event: "post.failed", title: "B", dedupeKey: "b" }, { repos })
    await emitNotification("someone-else", { event: "post.failed", title: "C", dedupeKey: "c" }, { repos })

    expect(await inbox()).toMatchObject({ unreadCount: 2 })
    expect((await inbox()).items).toHaveLength(2)

    const marked = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: first!.id }),
    })
    expect(await marked.json()).toMatchObject({ notification: { status: "read" }, unreadCount: 1 })
    expect((await inbox("?unread=1")).items).toHaveLength(1)

    const all = await readAll(new Request("http://localhost", { method: "POST" }), undefined)
    expect(await all.json()).toEqual({ marked: 1, unreadCount: 0 })
  })

  it("does not mark another workspace's notification", async () => {
    const other = await emitNotification("someone-else", { event: "post.failed", title: "C", dedupeKey: "c" }, { repos })
    const response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ id: other!.id }),
    })
    expect(response.status).toBe(404)
  })
})
