export type OvalIconCandidate = {
  key: string
  imageUrl: string
  imageCaption: string
}

export type OvalIconPlacement = OvalIconCandidate & {
  x: number
  y: number
  scale: number
  rotation: number
}

export type OvalIconLayout = {
  kind: "oval-icons"
  surrounding: OvalIconPlacement[]
}

export function seededOvalIconRandom(seed: string) {
  let state = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
// 20% larger than the original oval. Keep this boundary synchronized with the
// renderer; surrounding icon centers stay outside it while cards may overlap.
const OVAL = {
  cx: CANVAS_WIDTH * 0.5,
  cy: CANVAS_HEIGHT * 0.5,
  rx: CANVAS_WIDTH * 0.372,
  ry: CANVAS_HEIGHT * 0.318,
}
const ICON_BASE_SIZE = 146

export function createOvalIconLayout(input: {
  candidates: OvalIconCandidate[]
  focalKey: string
  random?: () => number
}): OvalIconLayout {
  const random = input.random ?? Math.random
  const candidates = shuffled(
    input.candidates.filter((candidate) => candidate.key !== input.focalKey),
    random
  )
  const targetCount = Math.min(candidates.length, 4 + Math.floor(random() * 5))
  const surrounding: OvalIconPlacement[] = []
  const sectorSize = (Math.PI * 2) / Math.max(1, targetCount)
  const phase =
    -Math.PI / 2 + sectorSize * 0.5 + (random() - 0.5) * sectorSize * 0.2

  for (const [index, candidate] of candidates.slice(0, targetCount).entries()) {
    const placement = placeCandidateInSector({
      candidate,
      existing: surrounding,
      baseAngle: phase + index * sectorSize,
      sectorSize,
      random,
    })
    if (placement) surrounding.push(placement)
  }

  if (surrounding.length < Math.min(4, candidates.length)) {
    throw new Error(
      "Oval icons layout needs at least four non-overlapping surrounding icons"
    )
  }

  return { kind: "oval-icons", surrounding }
}

function placeCandidateInSector(input: {
  candidate: OvalIconCandidate
  existing: OvalIconPlacement[]
  baseAngle: number
  sectorSize: number
  random: () => number
}) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const angle =
      input.baseAngle + (input.random() - 0.5) * input.sectorSize * 0.2
    const scale = 0.7 + input.random() * 0.6
    const radius = (ICON_BASE_SIZE * scale) / 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const normalLength = Math.hypot(cosine / OVAL.rx, sine / OVAL.ry)
    const normalX = cosine / OVAL.rx / normalLength
    const normalY = sine / OVAL.ry / normalLength
    const boundaryX = OVAL.cx + OVAL.rx * cosine
    const boundaryY = OVAL.cy + OVAL.ry * sine
    const maximumClearance = normalClearanceToFrame({
      x: boundaryX,
      y: boundaryY,
      normalX,
      normalY,
      radius,
    })
    const minimumClearance = 4
    if (maximumClearance <= minimumClearance) continue
    const clearance =
      minimumClearance + input.random() * (maximumClearance - minimumClearance)
    const x = boundaryX + normalX * clearance
    const y = boundaryY + normalY * clearance
    const placement: OvalIconPlacement = {
      ...input.candidate,
      x: (x / CANVAS_WIDTH) * 100,
      y: (y / CANVAS_HEIGHT) * 100,
      scale,
      rotation: -90 + input.random() * 180,
    }
    if (!insideFrame(x, y, radius)) continue
    if (overlaps(placement, input.existing)) continue
    return placement
  }
  return null
}

function normalClearanceToFrame(input: {
  x: number
  y: number
  normalX: number
  normalY: number
  radius: number
}) {
  const margin = 24
  const minX = margin + input.radius
  const maxX = CANVAS_WIDTH - margin - input.radius
  const minY = margin + input.radius
  const maxY = CANVAS_HEIGHT - margin - input.radius
  const horizontal =
    Math.abs(input.normalX) < 1e-6
      ? Number.POSITIVE_INFINITY
      : ((input.normalX > 0 ? maxX : minX) - input.x) / input.normalX
  const vertical =
    Math.abs(input.normalY) < 1e-6
      ? Number.POSITIVE_INFINITY
      : ((input.normalY > 0 ? maxY : minY) - input.y) / input.normalY
  return Math.min(horizontal, vertical) - 2
}

function insideFrame(x: number, y: number, radius: number) {
  const margin = 24
  return (
    x - radius >= margin &&
    x + radius <= CANVAS_WIDTH - margin &&
    y - radius >= margin &&
    y + radius <= CANVAS_HEIGHT - margin
  )
}

function overlaps(candidate: OvalIconPlacement, existing: OvalIconPlacement[]) {
  const candidateX = (candidate.x / 100) * CANVAS_WIDTH
  const candidateY = (candidate.y / 100) * CANVAS_HEIGHT
  const candidateRadius = (ICON_BASE_SIZE * candidate.scale) / 2
  return existing.some((placed) => {
    const dx = candidateX - (placed.x / 100) * CANVAS_WIDTH
    const dy = candidateY - (placed.y / 100) * CANVAS_HEIGHT
    const minimumDistance =
      candidateRadius + (ICON_BASE_SIZE * placed.scale) / 2 + 30
    return dx * dx + dy * dy < minimumDistance * minimumDistance
  })
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}
