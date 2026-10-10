/**
 * Static workspace shell data. The bundled audio/video/text assets of the
 * removed video workflows are gone: media now lives only in Appwrite
 * collections and the uploads library (lib/image-collections.ts, lib/assets.ts).
 */
interface RealFarmJson {
  brand: {
    name: "LumenClip"
    owner?: string
  }
}

const BRAND = {
  name: "LumenClip",
} as const satisfies RealFarmJson["brand"]

export type RealFarmData = RealFarmJson

export async function loadRealFarmData(): Promise<RealFarmData> {
  return { brand: BRAND }
}
