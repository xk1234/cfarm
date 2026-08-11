import postgres from "postgres"

type ProductItem = {
  id: string
  name: string
  salesInspirations?: unknown[]
  [key: string]: unknown
}

type ProductCollection = {
  id: string
  items: ProductItem[]
  updatedAt?: string
  [key: string]: unknown
}

type ProductProfile = {
  category: string
  challenge: string
  discovery: string
  visualStart: string
  action: string
  payoff: string
}

const apply = process.argv.includes("--apply")
const collectionId = "astrology-amazon-sg"
const connectionString =
  process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is required.")
}

const sql = postgres(connectionString, { max: 1, prepare: false })

try {
  const rows = await sql<
    Array<{
      row_id: string
      payload: ProductCollection
      source_row: Record<string, unknown> | null
    }>
  >`
    SELECT row_id, payload, source_row
    FROM domain_records
    WHERE table_name = 'permanent_assets'
      AND source_key = 'product_collection'
      AND rid = ${collectionId}
  `

  if (rows.length !== 1) {
    throw new Error(
      `Expected one ${collectionId} collection, found ${rows.length}.`
    )
  }

  const row = rows[0]
  const collection = row.payload
  const now = new Date().toISOString()
  const items = collection.items.map((item) => ({
    ...item,
    salesInspirations: buildInspirations(item),
  }))
  const nextCollection: ProductCollection = {
    ...collection,
    items,
    updatedAt: now,
  }
  const nextSourceRow = row.source_row
    ? {
        ...row.source_row,
        data: JSON.stringify(nextCollection),
        updated_at: now,
      }
    : null

  const profiles = items.reduce<Record<string, number>>((counts, item) => {
    const category = profileFor(item).category
    counts[category] = (counts[category] ?? 0) + 1
    return counts
  }, {})

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        collectionId,
        products: items.length,
        mappings: items.reduce(
          (count, item) => count + (item.salesInspirations?.length ?? 0),
          0
        ),
        profiles,
      },
      null,
      2
    )
  )

  if (apply) {
    await sql`
      UPDATE domain_records
      SET payload = ${sql.json(
        nextCollection as Parameters<typeof sql.json>[0]
      )},
          source_row = ${sql.json(
            nextSourceRow as Parameters<typeof sql.json>[0]
          )},
          migrated_at = now()
      WHERE table_name = 'permanent_assets'
        AND row_id = ${row.row_id}
    `
    console.log("Attached product-specific sales inspiration mappings.")
  }
} finally {
  await sql.end({ timeout: 5 })
}

function buildInspirations(item: ProductItem) {
  const profile = profileFor(item)
  return [
    {
      id: "question-reveal-demo",
      source: {
        platform: "reel_farm",
        label: "Question → reveal → demonstration",
        creator: "@freeyourmiind_",
        url: "https://reel.farm/dashboard/database?view=browse",
        views: 10_700_000,
        likes: 982_500,
        engagementRate: 9.2,
      },
      original: {
        textHook: "Are you brave enough to answer this question?",
        visualHook:
          "A short challenge appears over a rumpled white bed before the product is visible.",
        script: [
          "Challenge the viewer before showing the product.",
          "Reveal the journal on the same tactile surface.",
          "Move close enough to demonstrate one specific prompt.",
        ],
      },
      repurposed: {
        textHook: `Are you brave enough to ${profile.challenge}?`,
        visualHook: profile.visualStart,
        script: [
          `Place the challenge over ${lowerFirst(profile.visualStart)}`,
          profile.action,
          `End on ${profile.payoff}, keep ${item.name} visible, and name the exact astrology use case.`,
        ],
      },
      analysis: {
        pattern:
          "A curiosity challenge delays the product reveal, then a close demonstration resolves the question with physical proof.",
        whyItFits: `${profile.action} The proof frame, ${profile.payoff}, is legible without relying on a product claim.`,
      },
    },
    {
      id: "pov-discovery-proof",
      source: {
        platform: "reel_farm",
        label: "POV problem → discovery → proof",
        creator: "@hairwithjen",
        url: "https://reel.farm/dashboard/database?view=browse",
        views: 3_200_000,
        likes: 258_000,
        engagementRate: 8.1,
      },
      original: {
        textHook: "POV: you go to Sephora to find the ONE for hairloss...",
        visualHook:
          "An aspirational result shot appears before the product or shopping journey.",
        script: [
          "State the viewer's search or problem as a POV.",
          "Introduce the product as the discovery.",
          "Show the use and a visible result instead of only describing it.",
        ],
      },
      repurposed: {
        textHook: `POV: you finally find ${profile.discovery}`,
        visualHook: profile.visualStart,
        script: [
          `Open on ${lowerFirst(profile.visualStart)} with the POV text already visible.`,
          profile.action,
          `Use ${profile.payoff} as the proof frame, then label ${item.name} and its sign fit.`,
        ],
      },
      analysis: {
        pattern:
          "The opener shows the desired result before the product, frames the purchase as a search, and earns the recommendation with visible proof.",
        whyItFits: `${profile.visualStart} creates an immediate before-state; ${profile.payoff} supplies the visible result.`,
      },
    },
  ]
}

function profileFor(item: ProductItem): ProductProfile {
  const value = `${item.id} ${item.name}`.toLowerCase()

  if (/oracle|card deck/.test(value)) {
    return {
      category: "Oracle deck",
      challenge: "pull the card you actually need today",
      discovery: "an astrology deck you can demonstrate in one pull",
      visualStart: "a hand hovering over a face-down astrology card spread",
      action:
        "Turn over one card, then move closer to its artwork and message.",
      payoff: "the revealed card beside the rest of the spread",
    }
  }
  if (/necklace|bracelet|ring/.test(value)) {
    return {
      category: "Zodiac jewelry",
      challenge: "wear your sign without making it look like costume jewelry",
      discovery: "zodiac jewelry that looks subtle until the light hits it",
      visualStart: "a tight bare-neck, wrist, or hand close-up in window light",
      action:
        "Put the piece on in frame and rotate it until the zodiac detail catches the light.",
      payoff: "the symbol sparkling in a close try-on shot",
    }
  }
  if (/projector|neon sign/.test(value)) {
    return {
      category: "Light-up room décor",
      challenge: "turn one blank room into an astrology mood in seconds",
      discovery: "one light that changes the whole room after dark",
      visualStart: "an ordinary dark room with the product switched off",
      action:
        "Switch it on in the same locked shot, then pan across the light pattern or glow.",
      payoff:
        "the full room transformation with a person moving through the light",
    }
  }
  if (/wall art|tapestry|wall decor|wall décor/.test(value)) {
    return {
      category: "Astrology wall décor",
      challenge: "let your zodiac take over this empty wall",
      discovery: "astrology wall décor that makes a blank corner look finished",
      visualStart: "a deliberately empty wall or unfinished room corner",
      action:
        "Install or unfurl the piece in frame, preserving the before-and-after camera angle.",
      payoff: "a wide finished-room reveal followed by one texture close-up",
    }
  }
  if (/shelf/.test(value)) {
    return {
      category: "Moon display shelf",
      challenge: "make your crystal clutter look like an intentional altar",
      discovery: "a moon shelf that turns loose crystals into room décor",
      visualStart: "a scattered pile of crystals beside a bare wall",
      action:
        "Mount the shelf, then place the crystals one by one in a quick visual sequence.",
      payoff: "the organized crescent or moon-phase silhouette",
    }
  }
  if (/candle/.test(value)) {
    return {
      category: "Zodiac ritual candle",
      challenge: "build a five-minute ritual for your element",
      discovery: "a candle that makes a zodiac ritual visibly satisfying",
      visualStart:
        "an unlit candle framed tightly with its crystals and zodiac label",
      action:
        "Light the wick, show the flame catching, then circle the embedded stones and label.",
      payoff: "the warm melt-pool glow beside the matching sign details",
    }
  }
  if (/crystal|chakra/.test(value)) {
    return {
      category: "Crystal ritual kit",
      challenge: "choose the stone your sign keeps reaching for",
      discovery: "a crystal kit you can unpack and use on camera",
      visualStart: "a closed crystal kit on a clean ritual surface",
      action:
        "Unpack each stone into a deliberate grid and pick up the sign-specific piece.",
      payoff: "the complete color-sorted kit with one stone held close",
    }
  }
  if (/puzzle/.test(value)) {
    return {
      category: "Zodiac puzzle",
      challenge: "finish all twelve signs without checking the box",
      discovery: "a zodiac puzzle with a payoff worth filming",
      visualStart: "a pile of zodiac puzzle pieces spilling onto a table",
      action:
        "Use quick progress cuts as the symbols lock together, saving the centre piece for last.",
      payoff: "the completed zodiac wheel in a clean overhead shot",
    }
  }
  if (/blanket/.test(value)) {
    return {
      category: "Zodiac textile",
      challenge: "make your sofa announce your sign before you do",
      discovery: "a zodiac blanket that changes a plain reading corner",
      visualStart:
        "a plain sofa or bed with the folded blanket just out of frame",
      action:
        "Throw and spread the blanket in one motion, then sit down with the sign visible.",
      payoff: "the finished astrology reading nook",
    }
  }
  if (/tote/.test(value)) {
    return {
      category: "Zodiac accessory",
      challenge:
        "style an astrology tote without making the outfit look themed",
      discovery: "a zodiac tote that works in an everyday outfit",
      visualStart: "a neutral outfit shown without a bag",
      action:
        "Add the tote, load three daily essentials, and show it carried at walking pace.",
      payoff: "the full outfit with the zodiac graphic readable",
    }
  }
  if (/cup|makeup bag/.test(value)) {
    return {
      category: "Zodiac gift set",
      challenge: "build a zodiac gift that does not feel generic",
      discovery: "a zodiac gift set that looks good the moment it is opened",
      visualStart: "a closed gift box on a clean table with ribbon loosened",
      action:
        "Unbox the cup and bag, then fill each with one practical daily-use item.",
      payoff: "the complete personalized set arranged for gifting",
    }
  }
  if (/altar cloth|palmistry/.test(value)) {
    return {
      category: "Tarot table setup",
      challenge: "turn a bare table into a reading space in one move",
      discovery: "an altar cloth that makes every card spread look intentional",
      visualStart: "a bare table with a deck placed off to one side",
      action:
        "Unfurl the cloth across the frame and deal a simple three-card spread onto it.",
      payoff: "the full reading layout with the palmistry lines visible",
    }
  }
  if (/moon phase|moon-phase/.test(value)) {
    return {
      category: "Moon-phase décor",
      challenge: "make this wall look expensive with one moon-phase piece",
      discovery: "moon décor that creates an instant before-and-after",
      visualStart: "a blank wall above a desk, bed, or altar",
      action:
        "Hang the moon phases in one continuous sequence and pull back without changing angle.",
      payoff: "the finished silhouette casting shadows on the wall",
    }
  }

  return {
    category: "Visual astrology product",
    challenge: "prove this astrology find belongs in your daily routine",
    discovery: "an astrology product with a result people can see",
    visualStart:
      "the product just outside the frame beside its intended setting",
    action:
      "Bring it into frame, use it once, and keep the camera on the physical change.",
    payoff: "the product in use rather than a static pack shot",
  }
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1)
}
