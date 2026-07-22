import "server-only"

import path from "node:path"

import { clean } from "@/lib/guards"
import {
  deleteJsonArrayRecord,
  readJsonArrayRecord,
  upsertJsonArrayRecord,
} from "@/lib/json-store"

export type BrandPalette = {
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  foreground?: string
}

export type BrandProfile = {
  id: "brand-profile"
  niche: string
  audience: string
  voice: string[]
  pillars: string[]
  proofPoints: string[]
  prohibitedClaims: string[]
  palette?: BrandPalette
  createdAt: string
  updatedAt: string
}

export type BrandProfileInput = Omit<
  BrandProfile,
  "id" | "createdAt" | "updatedAt"
>

const store = {
  rootDir: path.join(process.cwd(), "data", "brand-profile"),
  fileName: "brand-profile.json",
  key: "profiles",
}

export function normalizeBrandProfile(value: unknown): BrandProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Partial<BrandProfile>
  const niche = clean(input.niche)
  const audience = clean(input.audience)
  if (!niche || !audience) return null
  const createdAt = clean(input.createdAt) || new Date().toISOString()
  const palette = normalizePalette(input.palette)
  return {
    id: "brand-profile",
    niche,
    audience,
    voice: stringList(input.voice),
    pillars: stringList(input.pillars),
    proofPoints: stringList(input.proofPoints),
    prohibitedClaims: stringList(input.prohibitedClaims),
    ...(palette ? { palette } : {}),
    createdAt,
    updatedAt: clean(input.updatedAt) || createdAt,
  }
}

export async function getBrandProfile(): Promise<BrandProfile | null> {
  return readJsonArrayRecord({
    ...store,
    id: "brand-profile",
    normalize: normalizeBrandProfile,
  })
}

export async function saveBrandProfile(
  input: BrandProfileInput
): Promise<BrandProfile> {
  const existing = await getBrandProfile()
  const now = new Date().toISOString()
  const profile = normalizeBrandProfile({
    ...input,
    id: "brand-profile",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  if (!profile) throw new Error("A brand niche and audience are required")
  await upsertJsonArrayRecord({ ...store, record: profile })
  return profile
}

export async function deleteBrandProfile(): Promise<boolean> {
  return deleteJsonArrayRecord({ ...store, id: "brand-profile" })
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(clean).filter(Boolean))]
}

function normalizePalette(value: unknown): BrandPalette | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const input = value as BrandPalette
  const palette = {
    primary: clean(input.primary) || undefined,
    secondary: clean(input.secondary) || undefined,
    accent: clean(input.accent) || undefined,
    background: clean(input.background) || undefined,
    foreground: clean(input.foreground) || undefined,
  }
  return Object.values(palette).some(Boolean) ? palette : undefined
}
