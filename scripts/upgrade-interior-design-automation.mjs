import { readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { Client, ID, Query, TablesDB } from "node-appwrite"

const root = process.cwd()
const collectionsPath = path.join(root, "data", "image-collections.json")
const automationsPath = path.join(
  root,
  "data",
  "automations",
  "automations.json"
)
const masterName = "Interior Design — Editorial Rooms"
const createdAt = "2026-07-14T14:30:00.000Z"

const collectionGroups = [
  { name: "Interior Design — Living Rooms", prefixes: ["Living room"] },
  { name: "Interior Design — Bedrooms", prefixes: ["Bedroom"] },
  { name: "Interior Design — Kitchens", prefixes: ["Kitchen"] },
  { name: "Interior Design — Bathrooms", prefixes: ["Bathroom"] },
  {
    name: "Interior Design — Dining & Apartments",
    prefixes: ["Dining room", "Apartment"],
  },
]

const collectionDatabase = JSON.parse(await readFile(collectionsPath, "utf8"))
const master = collectionDatabase.collections.find(
  (collection) => collection.name === masterName
)
if (!master || master.images.length < 100) {
  throw new Error(`${masterName} must contain at least 100 images`)
}

for (const group of collectionGroups) {
  const images = master.images.filter((image) =>
    group.prefixes.some((prefix) => image.caption.startsWith(`${prefix} —`))
  )
  if (images.length < 6) {
    throw new Error(`${group.name} has only ${images.length} matching images`)
  }
  const existing = collectionDatabase.collections.find(
    (collection) => collection.name === group.name
  )
  const next = {
    name: group.name,
    created_at: existing?.created_at || createdAt,
    pinned: false,
    images,
  }
  if (existing) Object.assign(existing, next)
  else collectionDatabase.collections.push(next)
}

const automationDatabase = JSON.parse(await readFile(automationsPath, "utf8"))
const automation = automationDatabase.automations.find(
  (item) => item.id === "automation-curtains-renter-glowup"
)
if (!automation) throw new Error("Interior design automation not found")

const schema = automation.schema
automation.name = "Interior Design — Customer Content Engine"
automation.updatedAt = "2026-07-14T14:30:00+08:00"
schema.title = automation.name
schema.prompt_formatting = {
  style:
    "Create a six-slide, lowercase TikTok interior-design slideshow using the selected repeatable format. The hook must name one room and one concrete decision. Write four concise points that directly answer the hook, then a format-specific soft CTA over a final relevant room image. Treat the routed image captions as the visual evidence: every body claim must describe a color, material, fixture, furniture choice, lighting choice, layout, or atmosphere that could genuinely appear in that room collection. Use one sharp contrast and one causal chain. Never use generic filler such as elevate, transform, unlock, game-changer, intentional, cohesive, timeless, or expensive-looking. Never invent dimensions, prices, products, building rules, or before-and-after claims. Use plain language, one idea per slide, and no jargon.",
  narrative: [
    "4 warm living room palettes worth copying",
    "4 bedroom palettes that feel restful",
    "4 kitchen finishes that won't date quickly",
    "4 bathroom finishes that feel calm",
    "4 dining room styles for a warmer home",
    "4 living room lighting ideas that add depth",
    "4 small apartment ideas that save space",
    "avoid these 4 living room layout mistakes",
    "3 bedroom choices making the room feel smaller",
    "4 dining room mistakes that ruin the flow",
    "how i'd style a narrow living room",
    "the bathroom details i'd choose first",
  ].join("\n"),
  num_of_slides: 6,
}

const collectionId = (name) =>
  `collection-${`${name}-${createdAt}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`

const living = collectionId("Interior Design — Living Rooms")
const bedrooms = collectionId("Interior Design — Bedrooms")
const kitchens = collectionId("Interior Design — Kitchens")
const bathrooms = collectionId("Interior Design — Bathrooms")
const diningApartments = collectionId("Interior Design — Dining & Apartments")

schema.content_strategy = {
  routes: [
    route(
      "living-visual-decisions",
      "visual_decision",
      ["living room (palettes|lighting)"],
      [living],
      "comment_prompt"
    ),
    route(
      "bedroom-visual-decisions",
      "visual_decision",
      ["bedroom palettes"],
      [bedrooms],
      "comment_prompt"
    ),
    route(
      "kitchen-visual-decisions",
      "visual_decision",
      ["kitchen finishes"],
      [kitchens],
      "comment_prompt"
    ),
    route(
      "bathroom-visual-decisions",
      "visual_decision",
      ["bathroom finishes"],
      [bathrooms],
      "comment_prompt"
    ),
    route(
      "dining-visual-decisions",
      "visual_decision",
      ["dining room styles"],
      [diningApartments],
      "comment_prompt"
    ),
    route(
      "apartment-visual-decisions",
      "visual_decision",
      ["small apartment"],
      [diningApartments, living, kitchens],
      "comment_prompt"
    ),
    route(
      "living-mistakes",
      "mistake_replacement",
      ["living room layout mistakes"],
      [living],
      "save_prompt"
    ),
    route(
      "bedroom-mistakes",
      "mistake_replacement",
      ["bedroom choices"],
      [bedrooms],
      "save_prompt"
    ),
    route(
      "dining-mistakes",
      "mistake_replacement",
      ["dining room mistakes"],
      [diningApartments],
      "save_prompt"
    ),
    route(
      "living-designer-help",
      "designer_recommendation",
      ["how i'd style"],
      [living],
      "customer_prompt"
    ),
    route(
      "bathroom-designer-help",
      "designer_recommendation",
      ["bathroom details"],
      [bathrooms],
      "customer_prompt"
    ),
  ],
}

schema.formatting = schema.formatting.map((section) => {
  if (section.id === "_tone") {
    return { ...section, value: "Authoritative & Reassuring" }
  }
  if (section.id === "hook") {
    return {
      ...section,
      aiImageSelection: true,
      textItems: section.textItems.map((item) => ({
        ...item,
        wordLengthMin: 5,
        wordLengthMax: 9,
        contentDirection:
          "Use the selected hook exactly in lowercase. Keep the room, number, and concrete design decision. Maximum 9 words.",
      })),
    }
  }
  if (section.id === "body") {
    return {
      ...section,
      aiImageSelection: true,
      textItems: section.textItems.map((item) => ({
        ...item,
        wordLengthMin: 3,
        wordLengthMax: 8,
        contentDirection:
          "Write one numbered lowercase visual verdict that directly answers the hook. Maximum 8 words. Name a visible color, material, furniture, fixture, lighting, layout, or atmosphere choice supported by the routed room collection. Use four distinct answers. Never write generic advice that could sit over any room.",
      })),
    }
  }
  if (section.id === "cta") {
    return {
      ...section,
      aiImageSelection: true,
      textItems: section.textItems.map((item) => ({
        ...item,
        wordLengthMin: 4,
        wordLengthMax: 9,
        contentDirection:
          "Write one lowercase soft CTA that follows the selected strategy: ask which option they would choose, ask them to save the exact room decision, or ask which room they need help with. Maximum 9 words. Never say download, buy now, link in bio, or DM me.",
      })),
    }
  }
  return section
})

schema.tiktok_post_settings.slideshow_slide_duration = 3
schema.tiktok_post_settings.caption.prompt_text =
  "write one lowercase sentence that restates the exact room decision and invites a specific comment; no generic inspiration language"
schema.tiktok_post_settings.description.prompt_text =
  "give 3-5 lowercase hashtags specific to the selected room and design decision, nothing else"
schema.reuse_policy = {
  ...schema.reuse_policy,
  image_exclusion_days: 14,
  image_exclusion_limit: 60,
  text_exclusion_days: 45,
  text_exclusion_limit: 30,
}

await atomicWrite(collectionsPath, collectionDatabase)
await atomicWrite(automationsPath, automationDatabase)
const synced = process.argv.includes("--sync")
  ? await syncToAppwrite({
      collections: collectionDatabase.collections.filter((collection) =>
        collection.name.startsWith("Interior Design — ")
      ),
      automation,
    })
  : false

console.log(
  JSON.stringify({
    automation: automation.name,
    masterImages: master.images.length,
    routedCollections: collectionGroups.map((group) => ({
      name: group.name,
      images: collectionDatabase.collections.find(
        (collection) => collection.name === group.name
      ).images.length,
    })),
    formats: [
      "visual_decision",
      "mistake_replacement",
      "designer_recommendation",
    ],
    synced,
  })
)

function route(id, format, hookPatterns, collectionIds, ctaStrategy) {
  return {
    id,
    format,
    hook_patterns: hookPatterns,
    collection_ids: collectionIds,
    cta_strategy: ctaStrategy,
  }
}

async function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporaryPath, filePath)
}

async function syncToAppwrite(input) {
  const endpoint = process.env.APPWRITE_ENDPOINT
  const projectId = process.env.APPWRITE_PROJECT_ID
  const apiKey = process.env.APPWRITE_API_KEY
  const ownerId = process.env.LUMENCLIP_SYSTEM_OWNER_ID
  const databaseId = process.env.APPWRITE_DATABASE_ID || "cfarm"
  if (!endpoint || !projectId || !apiKey || !ownerId) {
    throw new Error("Appwrite sync requires endpoint, project, key, and owner")
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
  const tables = new TablesDB(client)

  await syncRecords({
    tables,
    databaseId,
    tableId: "image_collections",
    ownerId,
    records: input.collections,
    recordId: (record) => record.name,
    recordName: (record) => record.name,
    recordStatus: () => "active",
    recordCreatedAt: (record) => record.created_at,
  })
  await syncRecords({
    tables,
    databaseId,
    tableId: "automations",
    ownerId,
    records: [input.automation],
    recordId: (record) => record.id,
    recordName: (record) => record.name,
    recordStatus: (record) => record.status,
    recordCreatedAt: (record) => record.updatedAt,
  })
  return true
}

async function syncRecords(input) {
  const rows = []
  let cursor
  for (;;) {
    const queries = [Query.equal("owner_id", [input.ownerId]), Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await input.tables.listRows(
      input.databaseId,
      input.tableId,
      queries
    )
    rows.push(...response.rows)
    if (response.rows.length < 100) break
    cursor = response.rows.at(-1)?.$id
  }

  for (const [index, record] of input.records.entries()) {
    const id = input.recordId(record)
    const existing = rows.find((row) => {
      if (row.rid === id || row.name === input.recordName(record)) return true
      try {
        const value = JSON.parse(row.data)
        return value.id === id || value.name === input.recordName(record)
      } catch {
        return false
      }
    })
    const payload = {
      rid: id,
      name: input.recordName(record),
      status: input.recordStatus(record),
      created_raw: input.recordCreatedAt(record),
      ord: existing?.ord ?? index,
      owner_id: input.ownerId,
      data: JSON.stringify({ ...record, ownerId: input.ownerId }),
    }
    if (existing) {
      await input.tables.updateRow(
        input.databaseId,
        input.tableId,
        existing.$id,
        payload
      )
    } else {
      await input.tables.createRow(
        input.databaseId,
        input.tableId,
        ID.unique(),
        payload
      )
    }
  }
}
