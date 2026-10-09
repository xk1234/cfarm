import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import postgres from "postgres"
import sharp from "sharp"

import { buildAmazonHomeImprovementInspirations } from "../lib/product-sales-inspirations"

type SourceItem = {
  asin: string
  name: string
  price: number
  imageUrl: string
  useCase: string
  commissionRate: number
  rating: number
  reviewCount: number
}

type SourceCollection = {
  id: string
  name: string
  description: string
  items: SourceItem[]
}

type SourceConfig = {
  collections: SourceCollection[]
  replaceCollectionIds: string[]
  sourceDatasetId: string
}

const apply = process.argv.includes("--apply")
const hooksOnly = process.argv.includes("--hooks-only")
const useRailway = process.argv.includes("--railway")
const railwayEnvironment = argumentValue("--environment")
const tunnelPort = argumentValue("--tunnel-port")
const sourceArg = argumentValue("--source")
const sourcePath = path.resolve(
  process.cwd(),
  sourceArg || "data/product-collections/amazon-home-improvement-sg.json"
)

if (useRailway) loadRailwayEnvironment()

const connectionString =
  process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    "DATABASE_PUBLIC_URL or DATABASE_URL is required. Pass --railway to load the linked Railway environment."
  )
}

const source = JSON.parse(await readFile(sourcePath, "utf8")) as unknown
const sourceConfig = validateSource(source)
const collections = sourceConfig.collections
const scrapedMedia = hooksOnly
  ? new Map<string, string[]>()
  : await loadScrapedMedia(sourceConfig.sourceDatasetId)
const sql = postgres(connectionString, { max: 1, prepare: false })

try {
  const ownerId = await resolveOwnerId()
  const existingRows = await sql<
    Array<{ row_id: string; ord: string | null; payload: unknown }>
  >`
    SELECT row_id, ord::text, payload
    FROM domain_records
    WHERE table_name = 'permanent_assets'
      AND source_key = 'product_collection'
      AND owner_id = ${ownerId}
    ORDER BY ord
  `
  const existingAsins = new Map<string, string>()
  for (const row of existingRows) {
    const collectionId = productCollectionId(row.payload)
    for (const item of productItems(row.payload)) {
      existingAsins.set(String(item.id).toUpperCase(), collectionId)
    }
  }
  const incomingAsins = collections.flatMap((collection) =>
    collection.items.map((item) => item.asin)
  )
  const duplicates = collections.flatMap((collection) =>
    collection.items
      .filter((item) => {
        const existingCollectionId = existingAsins.get(item.asin)
        return existingCollectionId && existingCollectionId !== collection.id
      })
      .map((item) => item.asin)
  )
  if (duplicates.length > 0) {
    throw new Error(
      `Refusing to import ASINs already present in LumenClip: ${duplicates.join(", ")}`
    )
  }

  const affiliateTag = clean(process.env.AMAZON_ASSOCIATE_TAG)
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        operation: hooksOnly ? "sales-inspiration-only" : "full-import",
        collections: collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          items: collection.items.length,
        })),
        totalItems: incomingAsins.length,
        availableMedia: incomingAsins.reduce(
          (total, asin) => total + (scrapedMedia.get(asin)?.length ?? 0),
          0
        ),
        existingProductCollections: existingRows.length,
        replacingExistingCollections: collections.filter((collection) =>
          existingRows.some(
            (row) => productCollectionId(row.payload) === collection.id
          )
        ).length,
        collectionsToReplace: sourceConfig.replaceCollectionIds.filter((id) =>
          existingRows.some((row) => productCollectionId(row.payload) === id)
        ).length,
        ...(hooksOnly ? {} : { affiliateTagConfigured: Boolean(affiliateTag) }),
      },
      null,
      2
    )
  )
  if (!apply) {
    console.log("Dry run complete; no database rows or bucket objects changed.")
  } else {
    const bucket = hooksOnly ? null : railwayBucketConfig()
    const s3 = bucket
      ? new S3Client({
          endpoint: bucket.endpoint,
          region: bucket.region,
          forcePathStyle: bucket.forcePathStyle,
          credentials: {
            accessKeyId: bucket.accessKeyId,
            secretAccessKey: bucket.secretAccessKey,
          },
        })
      : null
    const now = new Date().toISOString()
    const maxOrd = existingRows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.ord) || 0),
      -1
    )
    let uploaded = 0

    for (const [collectionIndex, collection] of collections.entries()) {
      const existing = existingRows.find(
        (row) => productCollectionId(row.payload) === collection.id
      )
      if (hooksOnly && !existing) {
        throw new Error(
          `Cannot attach sales inspiration because collection ${collection.id} does not exist.`
        )
      }
      const existingItems = new Map(
        productItems(existing?.payload).map((item) => [
          String(item.id).toUpperCase(),
          item,
        ])
      )
      const items = []
      for (const item of collection.items) {
        const salesInspirations = buildAmazonHomeImprovementInspirations(
          collection.id,
          item
        )
        if (hooksOnly) {
          const existingItem = existingItems.get(item.asin)
          if (!existingItem) {
            throw new Error(
              `Cannot attach sales inspiration because ${item.asin} is missing from ${collection.id}.`
            )
          }
          items.push({ ...existingItem, salesInspirations })
          continue
        }
        if (!s3 || !bucket) {
          throw new Error("Railway bucket configuration is unavailable.")
        }
        const sourceMedia = uniqueStrings(
          [item.imageUrl, ...(scrapedMedia.get(item.asin) ?? [])].map(
            originalAmazonImageUrl
          )
        )
        const media = []
        for (const [mediaIndex, sourceUrl] of sourceMedia.entries()) {
          const response = await fetch(sourceUrl, {
            headers: {
              "user-agent": "LumenClip product catalog importer/1.0",
            },
            signal: AbortSignal.timeout(60_000),
          })
          if (!response.ok) {
            throw new Error(
              `Could not download media ${mediaIndex + 1} for ${item.asin} (${response.status}).`
            )
          }
          const image = await sharp(Buffer.from(await response.arrayBuffer()))
            .rotate()
            .resize({
              width: 1600,
              height: 1600,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 88 })
            .toBuffer()
          const mediaId = `image-${String(mediaIndex + 1).padStart(2, "0")}`
          const relativePath = `product-collections/amazon-home-improvement/${collection.id}/${item.asin}-${mediaId}.webp`
          await putProductImage(s3, bucket.name, relativePath, image)
          uploaded += 1
          media.push({
            id: mediaId,
            type: "image" as const,
            role:
              mediaIndex === 0 ? ("primary" as const) : ("gallery" as const),
            url: localAssetUrl(relativePath),
            sourceUrl,
            mimeType: "image/webp",
          })
        }
        const assetUrl = media[0]?.url
        if (!assetUrl) throw new Error(`No media was stored for ${item.asin}.`)
        const marketplaceUrl = amazonUrl(item.asin, affiliateTag)
        items.push({
          id: item.asin,
          marketplace: "amazon",
          marketplaceUrl,
          name: item.name,
          currency: "SGD",
          price: item.price,
          priceLabel: `S$${item.price.toFixed(2)}`,
          commissionRate: item.commissionRate,
          estimatedCommission: roundMoney(item.price * item.commissionRate),
          storeImageUrl: assetUrl,
          generatedImageUrl: assetUrl,
          media,
          salesInspirations,
          rating: item.rating,
          reviewCount: item.reviewCount,
          useCase: item.useCase,
          sourcedAt: now,
        })
      }

      const createdAt = productCreatedAt(existing?.payload) || now
      const record = {
        ownerId,
        id: collection.id,
        name: collection.name,
        description: collection.description,
        items,
        createdAt,
        updatedAt: now,
        commissionDisclaimer:
          "Amazon.sg prices and estimated standard commissions were captured on 11 August 2026. Rates, category classification, availability, and prices can change; commissions apply only to qualifying purchases made through a valid Amazon Associates Special Link.",
        commissionSourceUrl:
          "https://affiliate-program.amazon.sg/help/node/topic/GRXPHT8U84RAYDXZ",
      }
      const rowId = ownedProductRowId(ownerId, collection.id)
      const ord = existing
        ? Number(existing.ord) || 0
        : maxOrd + collectionIndex + 1
      const sourceRow = {
        rid: collection.id,
        owner_id: ownerId,
        source_key: "product_collection",
        name: collection.name,
        status: "ready",
        ord,
        data: JSON.stringify(record),
      }
      const recordJson = JSON.parse(JSON.stringify(record))
      const sourceRowJson = JSON.parse(JSON.stringify(sourceRow))
      await sql`
      INSERT INTO domain_records (
        table_name, row_id, owner_id, source_key, rid, name, status, ord,
        payload, source_row, permissions, migrated_at
      ) VALUES (
        'permanent_assets', ${rowId}, ${ownerId}, 'product_collection',
        ${collection.id}, ${collection.name}, 'ready', ${ord},
        ${sql.json(recordJson)}, ${sql.json(sourceRowJson)}, ${sql.json([])}, now()
      )
      ON CONFLICT (table_name, row_id) DO UPDATE SET
        owner_id = excluded.owner_id,
        source_key = excluded.source_key,
        rid = excluded.rid,
        name = excluded.name,
        status = excluded.status,
        ord = excluded.ord,
        payload = excluded.payload,
        source_row = excluded.source_row,
        permissions = excluded.permissions,
        migrated_at = now()
    `
    }

    const importedCollectionIds = new Set(
      collections.map((collection) => collection.id)
    )
    const replacementRows = hooksOnly
      ? []
      : existingRows.filter((row) => {
          const id = productCollectionId(row.payload)
          return (
            sourceConfig.replaceCollectionIds.includes(id) &&
            !importedCollectionIds.has(id)
          )
        })
    for (const row of replacementRows) {
      if (!s3 || !bucket) {
        throw new Error("Railway bucket configuration is unavailable.")
      }
      for (const relativePath of productLocalMediaPaths(row.payload)) {
        await deleteProductImage(s3, bucket.name, relativePath)
      }
      await sql`
        DELETE FROM domain_records
        WHERE table_name = 'permanent_assets'
          AND row_id = ${row.row_id}
      `
    }

    if (hooksOnly) {
      const collectionIds = collections.map((collection) => collection.id)
      const expectedCounts = new Map(
        collections.flatMap((collection) =>
          collection.items.map(
            (item) =>
              [
                item.asin,
                buildAmazonHomeImprovementInspirations(collection.id, item)
                  .length,
              ] as const
          )
        )
      )
      const verification = await sql<
        Array<{
          product_id: string
          inspirations: number
          media: number
        }>
      >`
        SELECT
          product->>'id' AS product_id,
          jsonb_array_length(
            coalesce(product->'salesInspirations', '[]'::jsonb)
          )::int AS inspirations,
          jsonb_array_length(
            coalesce(product->'media', '[]'::jsonb)
          )::int AS media
        FROM domain_records
        CROSS JOIN LATERAL jsonb_array_elements(payload->'items') AS product
        WHERE table_name = 'permanent_assets'
          AND source_key = 'product_collection'
          AND owner_id = ${ownerId}
          AND payload->>'id' IN ${sql(collectionIds)}
      `
      const fullyMapped = verification.filter(
        (row) => expectedCounts.get(row.product_id) === row.inspirations
      ).length
      const inspirationCount = verification.reduce(
        (total, row) => total + row.inspirations,
        0
      )
      const mediaCount = verification.reduce(
        (total, row) => total + row.media,
        0
      )
      if (fullyMapped !== expectedCounts.size) {
        throw new Error(
          `Sales inspiration verification failed for ${expectedCounts.size - fullyMapped} products.`
        )
      }
      console.log(
        `Verified ${fullyMapped}/${expectedCounts.size} products with curated sales inspirations (${inspirationCount} total); ${mediaCount} existing media references preserved.`
      )
    }

    console.log(
      `${hooksOnly ? "Attached sales inspiration to" : "Imported"} ${collections.length} product collections and ${incomingAsins.length} products; uploaded ${uploaded} Railway bucket media files and replaced ${replacementRows.length} superseded collections.`
    )
    if (!affiliateTag && !hooksOnly) {
      console.log(
        "AMAZON_ASSOCIATE_TAG is not configured; products are commission-eligible, but links will not earn commission until the tag is added and the importer is rerun."
      )
    }
  }
} finally {
  await sql.end({ timeout: 5 })
}

async function resolveOwnerId() {
  const explicitOwner = clean(process.env.LUMENCLIP_SYSTEM_OWNER_ID)
  if (explicitOwner) return explicitOwner
  const owners = await sql<Array<{ owner_id: string }>>`
    SELECT DISTINCT owner_id
    FROM domain_records
    WHERE table_name = 'permanent_assets'
      AND source_key = 'product_collection'
      AND owner_id IS NOT NULL
  `
  if (owners.length !== 1) {
    throw new Error(
      `Expected exactly one existing product owner, found ${owners.length}. Set LUMENCLIP_SYSTEM_OWNER_ID explicitly.`
    )
  }
  return owners[0].owner_id
}

function loadRailwayEnvironment() {
  const web = railwayVariables("web", railwayEnvironment)
  const database = railwayVariables("Postgres", railwayEnvironment)
  const merged = { ...database, ...web }
  const publicDatabaseUrl = clean(
    database.DATABASE_PUBLIC_URL || database.DATABASE_URL_PUBLIC
  )
  const proxyHost = clean(database.RAILWAY_TCP_PROXY_DOMAIN)
  const proxyPort = clean(database.RAILWAY_TCP_PROXY_PORT)
  const databaseName = clean(database.PGDATABASE || database.POSTGRES_DB)
  const databaseUser = clean(database.PGUSER || database.POSTGRES_USER)
  const databasePassword = clean(
    database.PGPASSWORD || database.POSTGRES_PASSWORD
  )
  if (tunnelPort && databaseName && databaseUser && databasePassword) {
    const credentials = `${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}`
    merged.DATABASE_PUBLIC_URL = `postgresql://${credentials}@127.0.0.1:${encodeURIComponent(tunnelPort)}/${encodeURIComponent(databaseName)}?sslmode=disable`
  } else if (publicDatabaseUrl) {
    merged.DATABASE_PUBLIC_URL = publicDatabaseUrl
  } else if (
    proxyHost &&
    proxyPort &&
    databaseName &&
    databaseUser &&
    databasePassword
  ) {
    const credentials = `${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}`
    merged.DATABASE_PUBLIC_URL = `postgresql://${credentials}@${proxyHost}:${proxyPort}/${encodeURIComponent(databaseName)}?sslmode=require`
  }
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "string") process.env[key] = value
  }
}

function railwayVariables(
  service: string,
  environment: string
): Record<string, string> {
  const args = ["variables", "--service", service, "--json"]
  if (environment) args.push("--environment", environment)
  const output = execFileSync("railway", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  return JSON.parse(output) as Record<string, string>
}

function railwayBucketConfig() {
  return {
    name: required("RAILWAY_BUCKET_NAME", "AWS_S3_BUCKET_NAME", "BUCKET"),
    endpoint: required(
      "RAILWAY_BUCKET_ENDPOINT",
      "AWS_ENDPOINT_URL",
      "ENDPOINT"
    ),
    region:
      clean(
        process.env.RAILWAY_BUCKET_REGION ||
          process.env.AWS_DEFAULT_REGION ||
          process.env.REGION
      ) || "auto",
    accessKeyId: required(
      "RAILWAY_BUCKET_ACCESS_KEY_ID",
      "AWS_ACCESS_KEY_ID",
      "ACCESS_KEY_ID"
    ),
    secretAccessKey: required(
      "RAILWAY_BUCKET_SECRET_ACCESS_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "SECRET_ACCESS_KEY"
    ),
    forcePathStyle:
      clean(
        process.env.AWS_S3_URL_STYLE || process.env.RAILWAY_BUCKET_URL_STYLE
      ).toLowerCase() === "path",
  }
}

function required(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name])
    if (value) return value
  }
  throw new Error(`Missing Railway bucket variable: ${names.join(" or ")}.`)
}

function validateSource(value: unknown): SourceConfig {
  const source = object(value)
  const rawCollections = Array.isArray(value) ? value : source.collections
  if (!Array.isArray(rawCollections) || rawCollections.length === 0) {
    throw new Error("The source must contain a non-empty collections array.")
  }
  const sourceDatasetId = clean(source.sourceDatasetId)
  const replaceCollectionIds = Array.isArray(source.replaceCollectionIds)
    ? uniqueStrings(source.replaceCollectionIds.map(clean).filter(Boolean))
    : []
  const seenCollections = new Set<string>()
  const seenAsins = new Set<string>()
  const collections = rawCollections.map((rawCollection, collectionIndex) => {
    const collection = object(rawCollection)
    const id = clean(collection.id)
    const name = clean(collection.name)
    const description = clean(collection.description)
    if (!id || !name || !description || !Array.isArray(collection.items)) {
      throw new Error(`Collection ${collectionIndex + 1} is incomplete.`)
    }
    if (seenCollections.has(id))
      throw new Error(`Duplicate collection id ${id}.`)
    seenCollections.add(id)
    const items = collection.items.map((rawItem, itemIndex) => {
      const item = object(rawItem)
      const asin = clean(item.asin).toUpperCase()
      const price = Number(item.price)
      const commissionRate = Number(item.commissionRate)
      const rating = Number(item.rating)
      const reviewCount = Number(item.reviewCount)
      if (
        !/^[A-Z0-9]{10}$/.test(asin) ||
        !clean(item.name) ||
        !/^https:\/\//.test(clean(item.imageUrl)) ||
        !clean(item.useCase) ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(commissionRate) ||
        commissionRate <= 0 ||
        commissionRate > 1 ||
        !Number.isFinite(rating) ||
        rating < 0 ||
        rating > 5 ||
        !Number.isInteger(reviewCount) ||
        reviewCount < 0
      ) {
        throw new Error(`Item ${itemIndex + 1} in collection ${id} is invalid.`)
      }
      if (seenAsins.has(asin))
        throw new Error(`Duplicate incoming ASIN ${asin}.`)
      seenAsins.add(asin)
      return {
        asin,
        name: clean(item.name),
        price,
        imageUrl: clean(item.imageUrl),
        useCase: clean(item.useCase),
        commissionRate,
        rating,
        reviewCount,
      }
    })
    return { id, name, description, items }
  })
  return { collections, replaceCollectionIds, sourceDatasetId }
}

async function loadScrapedMedia(datasetId: string) {
  const mediaByAsin = new Map<string, string[]>()
  if (!datasetId) return mediaByAsin
  const token = clean(process.env.APIFY_TOKEN || process.env.APIFY_KEY)
  if (!token) {
    throw new Error(
      "APIFY_TOKEN or APIFY_KEY is required to load the product media dataset."
    )
  }
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=1000`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    }
  )
  if (!response.ok) {
    throw new Error(
      `Could not load Apify media dataset ${datasetId} (${response.status}).`
    )
  }
  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error(`Apify media dataset ${datasetId} was not an array.`)
  }
  for (const rawRow of rows) {
    const row = object(rawRow)
    const additional = object(row.additionalProperties)
    const asin = clean(additional.sku).toUpperCase()
    if (!asin) continue
    const gallery = Array.isArray(additional.images)
      ? additional.images.map((entry) => clean(object(entry).url))
      : []
    const urls = uniqueStrings([clean(row.image), ...gallery].filter(Boolean))
    if (urls.length > 0) mediaByAsin.set(asin, urls)
  }
  return mediaByAsin
}

async function putProductImage(
  s3: S3Client,
  bucketName: string,
  relativePath: string,
  image: Buffer
) {
  const fileId = createHash("sha256")
    .update(relativePath)
    .digest("hex")
    .slice(0, 36)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `appwrite/product_images/${fileId}`,
      Body: image,
      ContentType: "image/webp",
    })
  )
}

async function deleteProductImage(
  s3: S3Client,
  bucketName: string,
  relativePath: string
) {
  const fileId = createHash("sha256")
    .update(relativePath)
    .digest("hex")
    .slice(0, 36)
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: `appwrite/product_images/${fileId}`,
    })
  )
}

function localAssetUrl(relativePath: string) {
  return `/api/local-assets/${relativePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`
}

function productLocalMediaPaths(value: unknown) {
  const record = object(value)
  const urls = [clean(record.storeImageUrl), clean(record.generatedImageUrl)]
  for (const rawItem of Array.isArray(record.items) ? record.items : []) {
    const item = object(rawItem)
    urls.push(clean(item.storeImageUrl), clean(item.generatedImageUrl))
    for (const rawMedia of Array.isArray(item.media) ? item.media : []) {
      urls.push(clean(object(rawMedia).url))
    }
  }
  return uniqueStrings(urls)
    .filter((url) => url.startsWith("/api/local-assets/"))
    .map((url) =>
      url
        .slice("/api/local-assets/".length)
        .split("/")
        .map(decodeURIComponent)
        .join("/")
    )
}

function originalAmazonImageUrl(url: string) {
  return url.replace(/\._[^/]+_(\.[a-z0-9]+)$/i, "$1")
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function productItems(
  value: unknown
): Array<Record<string, unknown> & { id: unknown }> {
  const items = object(value).items
  return Array.isArray(items)
    ? (items.map(object).filter((item) => item.id != null) as Array<
        Record<string, unknown> & { id: unknown }
      >)
    : []
}

function productCollectionId(value: unknown) {
  return clean(object(value).id)
}

function productCreatedAt(value: unknown) {
  return clean(object(value).createdAt)
}

function ownedProductRowId(ownerId: string, id: string) {
  return `u${createHash("sha256")
    .update(`permanent_assets:product_collection:${ownerId}:${id}`)
    .digest("hex")
    .slice(0, 35)}`
}

function amazonUrl(asin: string, affiliateTag: string) {
  const url = new URL(`https://www.amazon.sg/dp/${asin}`)
  if (affiliateTag) url.searchParams.set("tag", affiliateTag)
  return url.toString()
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function argumentValue(name: string) {
  const exact = process.argv.indexOf(name)
  if (exact >= 0) return process.argv[exact + 1] || ""
  const inline = process.argv.find((value) => value.startsWith(`${name}=`))
  return inline ? inline.slice(name.length + 1) : ""
}
