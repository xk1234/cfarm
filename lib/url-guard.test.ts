import http from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { BlockedUrlError, guardedFetch, isPrivateAddress } from "@/lib/url-guard"

describe("isPrivateAddress (IPv6 embeddings)", () => {
  it.each(["64:ff9b::a9fe:a9fe", "::7f00:1", "2002:a9fe:a9fe::", "fec0::1", "2001:0:4136:e378::1"])(
    "blocks %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(true)
    }
  )
})

describe("guardedFetch", () => {
  let server: http.Server
  let port = 0
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/ok" })
        res.end()
        return
      }
      res.writeHead(200, { "content-type": "image/png" })
      res.end("internal secret")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  it("re-checks the address at connect time, so DNS rebinding after a pre-check is refused", async () => {
    // First answer (seen by a pre-check) is public; the connect-time answer is loopback.
    let calls = 0
    const rebinding = async () => {
      calls += 1
      return calls === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]
    }
    await rebinding()
    await expect(guardedFetch(`http://rebind.test:${port}/ok`, { lookup: rebinding })).rejects.toBeInstanceOf(
      BlockedUrlError
    )
  })

  it("blocks private IP literals, localhost and non-http schemes", async () => {
    await expect(guardedFetch(`http://127.0.0.1:${port}/ok`)).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(guardedFetch(`http://[::ffff:127.0.0.1]:${port}/ok`)).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(guardedFetch("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(guardedFetch(`http://localhost:${port}/ok`)).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it("returns redirects unfollowed and streams allowed responses", async () => {
    const options = {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      isAllowedAddress: (ip: string) => ip === "127.0.0.1",
    }
    const redirect = await guardedFetch(`http://ok.test:${port}/redirect`, options)
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get("location")).toBe("/ok")
    const ok = await guardedFetch(`http://ok.test:${port}/ok`, options)
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toBe("image/png")
    expect(await ok.text()).toBe("internal secret")
  })
})

describe("isPrivateAddress", () => {
  it("rejects private and reserved IPv4 ranges", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true)
    expect(isPrivateAddress("172.16.0.1")).toBe(true)
    expect(isPrivateAddress("172.31.255.255")).toBe(true)
    expect(isPrivateAddress("192.168.1.1")).toBe(true)
    expect(isPrivateAddress("127.0.0.1")).toBe(true)
    expect(isPrivateAddress("169.254.10.20")).toBe(true)
    expect(isPrivateAddress("0.1.2.3")).toBe(true)
  })

  it("allows public IPv4 addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
    expect(isPrivateAddress("1.1.1.1")).toBe(false)
    expect(isPrivateAddress("172.32.0.1")).toBe(false)
  })

  it("rejects private and reserved IPv6 ranges", () => {
    expect(isPrivateAddress("::1")).toBe(true)
    expect(isPrivateAddress("::")).toBe(true)
    expect(isPrivateAddress("fc00::1")).toBe(true)
    expect(isPrivateAddress("fd12:3456:789a::1")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
  })

  it("checks IPv4-mapped IPv6 addresses", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateAddress("::ffff:192.168.1.5")).toBe(true)
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false)
  })

  it("allows public IPv6 addresses", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false)
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false)
  })
})
