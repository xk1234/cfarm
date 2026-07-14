/**
 * Import and grade downloaded TikTok slideshows into the shared benchmark corpus.
 * Unlike import-reelfarm-benchmarks.mjs this only upserts — it never deletes
 * existing corpus rows.
 *
 * Expects a source directory containing:
 *   profile.json            – clockworks/tiktok-scraper dataset items for the creator
 *   post_<id>/meta.json     – { id, text, playCount, diggCount, commentCount,
 *                               shareCount, collectCount, createTimeISO, numSlides }
 *   post_<id>/slide_NN.jpg  – the slideshow images in order
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/import-tiktok-corpus.mjs <source-dir> <creator-niche> [ord-offset]
 */
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { Client, Storage, TablesDB } from "node-appwrite"
import { InputFile } from "node-appwrite/file"
import sharp from "sharp"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "benchmark_corpus"
const BUCKET = "benchmark_images"
const MODEL = "google/gemini-2.5-flash"
const SOURCE_DIR = process.argv[2]
const NICHE = process.argv[3] || "astrology"
const ORD_OFFSET = Number(process.argv[4] || 200)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!SOURCE_DIR) throw new Error("Usage: node scripts/import-tiktok-corpus.mjs <source-dir> [niche] [ord-offset]")
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required")

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)
const storage = new Storage(client)

const profile = JSON.parse(await readFile(path.join(SOURCE_DIR, "profile.json"), "utf8"))
const postDirs = (await readdir(SOURCE_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("post_"))
  .map((entry) => entry.name)
  .sort()

let index = 0
for (const dir of postDirs) {
  const meta = JSON.parse(await readFile(path.join(SOURCE_DIR, dir, "meta.json"), "utf8"))
  const sourceItem = profile.find((item) => item.id === meta.id) ?? {}
  const author = sourceItem.authorMeta ?? {}
  const sourceId = `tiktok-${meta.id}`

  const slideFiles = (await readdir(path.join(SOURCE_DIR, dir)))
    .filter((name) => /^slide_\d+\.(jpg|jpeg|png|webp)$/.test(name))
    .sort()
  const slides = []
  const gradingUrls = []
  for (const [slideIndex, fileName] of slideFiles.entries()) {
    const original = await readFile(path.join(SOURCE_DIR, dir, fileName))
    const image = sharp(original).rotate()
    const metadata = await image.metadata()
    const converted = await image
      .resize({ width: 768, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer()
    const storedName = `slide-${String(slideIndex + 1).padStart(3, "0")}.webp`
    const relative = `benchmarks/tiktok/${sourceId}/${storedName}`
    const fileId = createHash("sha256").update(relative).digest("hex").slice(0, 36)
    try {
      await storage.createFile(BUCKET, fileId, InputFile.fromBuffer(converted, storedName), [])
    } catch (error) {
      if (error?.code !== 409) throw error
    }
    slides.push({
      id: `${sourceId}-slide-${slideIndex + 1}`,
      imageUrl: `/api/local-assets/${relative}`,
      role: slideIndex === 0 ? "hook" : slideIndex === slideFiles.length - 1 ? "cta" : "content",
      width: metadata.width,
      height: metadata.height,
      bytes: converted.byteLength,
    })
    gradingUrls.push(`data:image/webp;base64,${converted.toString("base64")}`)
  }

  const creator = {
    id: author.id || "",
    username: author.name || "cosmance.co",
    nickname: author.nickName || author.name || "",
    signature: author.signature || "",
    followerCount: String(author.fans ?? ""),
    followingCount: String(author.following ?? ""),
    avatarUrl: author.avatar || "",
    niche: NICHE,
    product: author.signature || "",
    productMedium: "website",
    linkInBio: author.bioLink || "",
    region: author.region || "",
    audienceRegions: [],
  }
  const stats = {
    viewsLabel: String(meta.playCount ?? ""),
    likesLabel: String(meta.diggCount ?? ""),
    bookmarksLabel: String(meta.collectCount ?? ""),
    views: Number(meta.playCount ?? 0),
    likes: Number(meta.diggCount ?? 0),
    bookmarks: Number(meta.collectCount ?? 0),
  }
  const icp = [NICHE, creator.productMedium, creator.product].filter(Boolean).join(" · ")
  const grade = await gradeSlideshow({
    title: `@${creator.username} TikTok slideshow`,
    icp,
    imageUrls: gradingUrls,
  })
  const now = new Date().toISOString()
  const record = {
    id: sourceId,
    source: "tiktok",
    sourceUrl: sourceItem.webVideoUrl || `https://www.tiktok.com/@${creator.username}/photo/${meta.id}`,
    creator,
    stats,
    slides,
    prompt: meta.text || "",
    icp,
    ...grade,
    model: MODEL,
    createdAt: meta.createTimeISO || now,
    gradedAt: now,
  }
  await tables.upsertRow(DB, TABLE, rowId(sourceId), {
    rid: sourceId,
    name: `@${creator.username}`,
    status: "graded",
    created_raw: record.createdAt,
    ord: ORD_OFFSET + index,
    data: JSON.stringify(record),
  })
  index += 1
  console.log(`[${index}/${postDirs.length}] ${sourceId} views=${stats.views} overall=${record.scores.overall} slides=${slides.length}`)
  await sleep(180)
}
console.log(`DONE: ${index} TikTok slideshows imported into the corpus`)

async function gradeSlideshow({ title, icp, imageUrls }) {
  const content = [
    {
      type: "text",
      text: `Slideshow title: ${title}\nTarget ICP: ${icp || "Infer from the slideshow"}\nThere are ${imageUrls.length} slides in order.`,
    },
  ]
  imageUrls.forEach((url, i) => {
    const marker =
      i === 0
        ? " (HOOK — use only this slide for hook virality)"
        : i === imageUrls.length - 1
          ? " (FINAL slide — judge the close/CTA here for conversation potential)"
          : ""
    content.push({ type: "text", text: `Slide ${i + 1}${marker}` })
    content.push({ type: "image_url", image_url: { url } })
  })
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          // Keep in sync with benchmarkGraderSystemPrompt in lib/slideshow-benchmarks.ts.
          content: [
            "You are a strict short-form slideshow creative benchmarker. Grade four independent dimensions from 0 to 10 using integers. Judge the rendered pixels: actual text placement, legibility, image relevance, specificity, and narrative progression. A 5 is average; 8+ requires unusually strong evidence. Do not reward production polish that does not improve the metric being scored.",
            "",
            "hookVirality — use ONLY slide 1. On a photo slideshow the slide-1 text is the headline and the image is the visual hook; grade both plus their alignment:",
            "- Rapid context: after one read the viewer knows exactly what the post is about and who it is for. The wording must have one unmistakable reading; any plausible confusion loses points.",
            "- Curiosity loop via contrast: the hook states or implies a gap between what people currently believe or expect and what the post will reveal. Bigger, more surprising contrast scores higher. A plain topic label or bland statement with no tension caps this dimension at 4.",
            "- Distillation and direct address: fewest possible words, no wasted openers ('in my opinion', throat-clearing), text big and legible near eye level. 'You/your' or a named identity call-out ('October Scorpios', 'homeschool moms') beats 'I/me' framing unless the me-story is universally relatable.",
            "- Text-visual alignment: the image must amplify the same idea as the text; a generic or mismatched image weakens the hook.",
            "Anchors: 3 = topic label with no tension over an unrelated photo; 5 = clear topic with mild curiosity; 8 = unmistakable topic plus strong stated or implied contrast plus an aligned scroll-stopping visual; 10 = all of that plus an identity call-out or stakes that make skipping feel costly.",
            "",
            "pictureTextFit — use ALL slides: legibility of every text block against its background (contrast, size, safe placement, nothing important covered), consistent styling across slides, and whether each image's subject and mood match — ideally amplify — that slide's text. Native platform-feel (looks typed in the app) beats ad-style polish.",
            "",
            "usefulnessToIcp — use ALL slides: each slide should deliver a specific, concrete, NEW point (a behavior, scene, example, or number) the target ICP would care about. Generic trait lists, repeated points, or filler cap this at 4. Density matters: a slide worth reading for five seconds beats a thin quip. Progression should build across slides, not shuffle.",
            "",
            "conversationPotential — use ALL slides: score the signals that actually drive comments, shares, and saves — identity signaling ('this is me' / 'send this to her'), a confident take that is just polarizing enough, open questions, a natural CTA (tag someone, comment your sign, which one next), and a final slide worth screenshotting. A post that ends flat with no invitation caps at 5.",
          ].join("\n"),
        },
        { role: "user", content },
      ],
      response_format: benchmarkResponseFormat(),
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter ${response.status}`)
  const raw = payload.choices?.[0]?.message?.content
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  const scores = Object.fromEntries(
    Object.entries(parsed.scores).map(([key, value]) => [
      key,
      Math.max(0, Math.min(10, Math.round(Number(value) || 0))),
    ])
  )
  scores.overall =
    Math.round(
      ((scores.hookVirality +
        scores.pictureTextFit +
        scores.usefulnessToIcp +
        scores.conversationPotential) /
        4) *
        10
    ) / 10
  return { scores, rationales: parsed.rationales }
}

function benchmarkResponseFormat() {
  const keys = ["hookVirality", "pictureTextFit", "usefulnessToIcp", "conversationPotential"]
  return {
    type: "json_schema",
    json_schema: {
      name: "slideshow_benchmark",
      strict: true,
      schema: {
        type: "object",
        properties: {
          scores: {
            type: "object",
            properties: Object.fromEntries(
              keys.map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])
            ),
            required: keys,
            additionalProperties: false,
          },
          rationales: {
            type: "object",
            properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }])),
            required: keys,
            additionalProperties: false,
          },
        },
        required: ["scores", "rationales"],
        additionalProperties: false,
      },
    },
  }
}

function rowId(id) {
  return `r${createHash("sha256").update(`${TABLE}:${id}`).digest("hex").slice(0, 35)}`
}
