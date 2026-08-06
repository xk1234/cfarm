import { afterEach, describe, expect, it } from "vitest"

import {
  assetBackend,
  dataBackend,
  railwayCutoverEnabled,
} from "@/lib/backend-config"

const originalDataBackend = process.env.LUMENCLIP_DATA_BACKEND
const originalAssetBackend = process.env.LUMENCLIP_ASSET_BACKEND

afterEach(() => {
  restore("LUMENCLIP_DATA_BACKEND", originalDataBackend)
  restore("LUMENCLIP_ASSET_BACKEND", originalAssetBackend)
})

describe("backend configuration", () => {
  it("uses Railway by default after the runtime cutover", () => {
    delete process.env.LUMENCLIP_DATA_BACKEND
    delete process.env.LUMENCLIP_ASSET_BACKEND
    expect(dataBackend()).toBe("railway")
    expect(assetBackend()).toBe("railway")
    expect(railwayCutoverEnabled()).toBe(true)
  })

  it("allows storage to move independently before the data cutover", () => {
    process.env.LUMENCLIP_DATA_BACKEND = "appwrite"
    process.env.LUMENCLIP_ASSET_BACKEND = "railway"
    expect(dataBackend()).toBe("appwrite")
    expect(assetBackend()).toBe("railway")
    expect(railwayCutoverEnabled()).toBe(true)
  })

  it("rejects misspelled backend names", () => {
    process.env.LUMENCLIP_DATA_BACKEND = "railwy"
    expect(() => dataBackend()).toThrow(/LUMENCLIP_DATA_BACKEND/)
  })
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
