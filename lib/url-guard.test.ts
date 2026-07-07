import { describe, expect, it } from "vitest"

import { isPrivateAddress } from "@/lib/url-guard"

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
