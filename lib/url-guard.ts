import dns from "node:dns"
import net from "node:net"

export async function assertPublicHttpUrl(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http or https")
  }

  const hostname = cleanHostname(parsed.hostname)
  if (net.isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("URL hostname resolves to a private or reserved address")
  }

  const addresses = await dns.promises.lookup(hostname, { all: true })
  if (addresses.length === 0) {
    throw new Error("URL hostname could not be resolved")
  }

  for (const address of addresses) {
    if (isPrivateAddress(address.address)) {
      throw new Error("URL hostname resolves to a private or reserved address")
    }
  }

  return parsed
}

export function isPrivateAddress(ip: string) {
  const cleanIp = cleanHostname(ip)
  const ipv4 = parseIpv4(cleanIp)
  if (ipv4) {
    return isPrivateIpv4(ipv4)
  }

  const ipv6 = parseIpv6(cleanIp)
  if (!ipv6) {
    return false
  }

  const mappedIpv4 = ipv4FromMappedIpv6(ipv6)
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4)
  }

  const isUnspecified = ipv6.every((part) => part === 0)
  const isLoopback =
    ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1
  const isUniqueLocal = (ipv6[0] & 0xfe00) === 0xfc00
  const isLinkLocal = (ipv6[0] & 0xffc0) === 0xfe80

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal
}

function cleanHostname(value: string) {
  return value.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase()
}

function parseIpv4(value: string) {
  const parts = value.split(".")
  if (parts.length !== 4) {
    return null
  }

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return NaN
    }
    const value = Number(part)
    return value >= 0 && value <= 255 ? value : NaN
  })

  return octets.every(Number.isFinite)
    ? (octets as [number, number, number, number])
    : null
}

function isPrivateIpv4([first, second, third]: [
  number,
  number,
  number,
  number,
]) {
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  )
}

function parseIpv6(value: string) {
  let input = value
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":")
    const ipv4 = parseIpv4(input.slice(lastColon + 1))
    if (lastColon < 0 || !ipv4) {
      return null
    }
    input = `${input.slice(0, lastColon)}:${toHexWord(
      ipv4[0],
      ipv4[1]
    )}:${toHexWord(ipv4[2], ipv4[3])}`
  }

  if (!/^[0-9a-f:]+$/i.test(input)) {
    return null
  }

  const halves = input.split("::")
  if (halves.length > 2) {
    return null
  }

  const left = parseIpv6Words(halves[0])
  const right = halves.length === 2 ? parseIpv6Words(halves[1]) : []
  if (!left || !right) {
    return null
  }

  const missing = 8 - left.length - right.length
  if (halves.length === 1) {
    return missing === 0 ? left : null
  }
  if (missing < 1) {
    return null
  }

  return [...left, ...Array(missing).fill(0), ...right]
}

function parseIpv6Words(value: string) {
  if (!value) {
    return []
  }

  const words = value.split(":").map((part) => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return NaN
    }
    return Number.parseInt(part, 16)
  })

  return words.every(Number.isFinite) ? words : null
}

function toHexWord(first: number, second: number) {
  return ((first << 8) + second).toString(16)
}

function ipv4FromMappedIpv6(words: number[]) {
  if (
    words.length !== 8 ||
    !words.slice(0, 5).every((part) => part === 0) ||
    words[5] !== 0xffff
  ) {
    return null
  }

  return [
    words[6] >> 8,
    words[6] & 0xff,
    words[7] >> 8,
    words[7] & 0xff,
  ] as [number, number, number, number]
}
