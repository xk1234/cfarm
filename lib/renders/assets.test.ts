import http from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"
import { AssetLoadError } from "@/lib/render/engine"
import { createServerAssetLoader, fetchRemoteImage, imageDimensions, sniffImageMime } from "@/lib/renders/assets"
import { TINY_PNG } from "@/lib/renders/test-fakes"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQFBT8D8IMMAYAJYYEyZlPB2MAAAAASUVORK5CYII=",
  "base64"
)

const publicOnly = async (url: string) => {
  if (/\/\/(127\.|10\.|169\.254\.|localhost)/.test(url)) throw new Error("private address")
}

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return "ok"
  } catch (err) {
    return err instanceof AssetLoadError ? err.code : String(err)
  }
}

describe("fetchRemoteImage (injected fetch)", () => {
  it("fetches a public image and sniffs its type", async () => {
    const asset = await fetchRemoteImage("https://cdn.example/a", {
      guard: publicOnly,
      fetch: async () => new Response(TINY_PNG, { headers: { "content-type": "application/octet-stream" } }),
    })
    expect(asset.mime).toBe("image/png")
    expect(asset.bytes.byteLength).toBe(TINY_PNG.byteLength)
  })

  it("re-checks every redirect target against the SSRF guard", async () => {
    const error = await fetchRemoteImage("https://cdn.example/a", {
      guard: publicOnly,
      fetch: async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AssetLoadError)
    expect((error as AssetLoadError).code).toBe("asset.fetch_failed")
  })

  it("enforces the size cap while streaming", async () => {
    const error = await fetchRemoteImage("https://cdn.example/big", {
      guard: publicOnly,
      maxBytes: 10,
      fetch: async () => new Response(new Uint8Array(64)),
    }).catch((e: unknown) => e)
    expect((error as AssetLoadError).code).toBe("asset.too_large")
  })

  it("uses the DNS-pinned fetch by default, so a pre-check that passes cannot reach a private host", async () => {
    // A guard that approves everything stands in for a pre-check fooled by DNS rebinding.
    const error = await fetchRemoteImage("http://127.0.0.1:9/latest", {
      guard: async () => undefined,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AssetLoadError)
    expect((error as AssetLoadError).code).toBe("asset.fetch_failed")
    expect((error as AssetLoadError).message).toMatch(/blocked address/)
  })

  it("rejects non-images", async () => {
    const error = await fetchRemoteImage("https://cdn.example/page", {
      guard: publicOnly,
      fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    }).catch((e: unknown) => e)
    expect((error as AssetLoadError).code).toBe("asset.unsupported_type")
  })

  it("never trusts a declared image Content-Type when the body is not an image", async () => {
    const error = await fetchRemoteImage("https://cdn.example/fake.png", {
      guard: publicOnly,
      fetch: async () => new Response("<html>not an image</html>", { headers: { "content-type": "image/png" } }),
    }).catch((e: unknown) => e)
    expect((error as AssetLoadError).code).toBe("asset.unsupported_type")
  })
})

describe("fetchRemoteImage (real sockets, injected DNS policy)", () => {
  let server: http.Server
  let port = 0
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      switch (req.url) {
        case "/img.png":
          res.writeHead(200, { "content-type": "image/png" })
          res.end(PNG)
          return
        case "/html":
          res.writeHead(200, { "content-type": "image/png" })
          res.end("<html>not an image</html>")
          return
        case "/big":
          res.writeHead(200, { "content-type": "image/png" })
          res.write(PNG)
          res.end(Buffer.alloc(4096))
          return
        case "/to-private":
          res.writeHead(302, { location: `http://evil.test:${port}/img.png` })
          res.end()
          return
        case "/to-ok":
          res.writeHead(301, { location: "/img.png" })
          res.end()
          return
        case "/loop":
          res.writeHead(302, { location: "/loop" })
          res.end()
          return
        case "/slow":
          setTimeout(() => res.end(PNG), 2000)
          return
        default:
          res.writeHead(404)
          res.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  // "ok.test" → loopback (allowed only for this test), "evil.test" → a private address.
  const options = {
    lookup: async (host: string) =>
      host === "ok.test" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.7", family: 4 }],
    isAllowedAddress: (ip: string) => ip === "127.0.0.1",
  }

  it("fetches and sniffs an image", async () => {
    const asset = await fetchRemoteImage(`http://ok.test:${port}/img.png`, options)
    expect(asset.mime).toBe("image/png")
    expect(asset.bytes.byteLength).toBe(PNG.byteLength)
  })

  it("blocks private resolution, IP literals and non-http schemes with the default policy", async () => {
    expect(await code(fetchRemoteImage(`http://127.0.0.1:${port}/img.png`))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage(`http://[::1]:${port}/img.png`))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage(`http://evil.test:${port}/img.png`, options))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage("file:///etc/passwd"))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage(`http://user:pw@ok.test:${port}/img.png`, options))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage("http://localhost/img.png"))).toBe("asset.fetch_failed")
  })

  it("re-validates every redirect hop", async () => {
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/to-private`, options))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/to-ok`, options))).toBe("ok")
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/loop`, options))).toBe("asset.fetch_failed")
  })

  it("enforces the byte cap, timeout and content sniffing", async () => {
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/big`, { ...options, maxBytes: 1024 }))).toBe("asset.too_large")
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/slow`, { ...options, timeoutMs: 200 }))).toBe("asset.fetch_failed")
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/html`, options))).toBe("asset.unsupported_type")
    expect(await code(fetchRemoteImage(`http://ok.test:${port}/missing`, options))).toBe("asset.fetch_failed")
  })
})

describe("createServerAssetLoader", () => {
  async function setup() {
    const repos = createMemoryRepositories()
    const bytes = new Uint8Array(PNG)
    await repos.blobs.put("ws-a", "media", "file-1", bytes, "image/png")
    const { value: media } = await repos.media.create("ws-a", {
      kind: "image",
      fileId: "file-1",
      mimeType: "image/png",
      sizeBytes: bytes.byteLength,
      sha256: "x",
      source: "upload",
      createdBy: "ws-a",
    })
    return { repos, media }
  }

  it("loads owned media from blobs and refuses other workspaces", async () => {
    const { repos, media } = await setup()
    const own = createServerAssetLoader(repos, "ws-a")
    const asset = await own.load({ media: media.id })
    expect(asset.mime).toBe("image/png")
    const other = createServerAssetLoader(repos, "ws-b")
    expect(await code(other.load({ media: media.id }))).toBe("asset.fetch_failed")
    expect(await code(own.load({ media: "nope" }))).toBe("asset.fetch_failed")
  })

  it("refuses media whose bytes are not an image", async () => {
    const { repos } = await setup()
    await repos.blobs.put("ws-a", "media", "file-2", new TextEncoder().encode("<html>"), "image/png")
    const { value: fake } = await repos.media.create("ws-a", {
      kind: "image",
      fileId: "file-2",
      mimeType: "image/png",
      sizeBytes: 6,
      sha256: "y",
      source: "upload",
      createdBy: "ws-a",
    })
    const loader = createServerAssetLoader(repos, "ws-a")
    expect(await code(loader.load({ media: fake.id }))).toBe("asset.unsupported_type")
  })

  it("routes URLs through the remote fetcher once per URL", async () => {
    const { repos } = await setup()
    let calls = 0
    const loader = createServerAssetLoader(repos, "ws-a", {
      fetchUrl: async () => {
        calls++
        return { bytes: new Uint8Array(PNG), mime: "image/png" }
      },
    })
    await loader.load({ url: "https://example.com/a.png" })
    await loader.load({ url: "https://example.com/a.png" })
    expect(calls).toBe(1)
  })

  it("passes fetch options through to the guarded fetch for URLs", async () => {
    const { repos } = await setup()
    const loader = createServerAssetLoader(repos, "ws-a", {
      guard: publicOnly,
      fetch: async () => new Response(TINY_PNG),
    })
    expect((await loader.load({ url: "https://cdn.example/a.png" })).mime).toBe("image/png")
    expect(await code(loader.load({ url: "http://169.254.169.254/x" }))).toBe("asset.fetch_failed")
  })
})

describe("image sniffing", () => {
  it("reads PNG type and dimensions", () => {
    expect(sniffImageMime(TINY_PNG)).toBe("image/png")
    expect(imageDimensions(TINY_PNG)).toEqual({ width: 1, height: 1 })
  })
})
