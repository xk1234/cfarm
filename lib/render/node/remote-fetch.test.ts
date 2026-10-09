import http from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AssetLoadError } from "../engine"
import { fetchRemoteImage, isBlockedAddress, parseIpv6 } from "./remote-fetch"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQFBT8D8IMMAYAJYYEyZlPB2MAAAAASUVORK5CYII=",
  "base64"
)

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2002:a9fe:a9fe::",
    "fd00:ec2::254",
    "fe80::1",
    "ff02::1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(["93.184.216.34", "151.101.1.69", "2606:4700:4700::1111", "::ffff:93.184.216.34"])("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })

  it("parses IPv6 forms", () => {
    expect(parseIpv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304])
    expect(parseIpv6("1::")).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    expect(parseIpv6("1:2:3:4:5:6:7:8:9")).toBeNull()
  })
})

describe("fetchRemoteImage", () => {
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
  const code = async (p: Promise<unknown>) => {
    try {
      await p
      return "ok"
    } catch (err) {
      return err instanceof AssetLoadError ? err.code : String(err)
    }
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
