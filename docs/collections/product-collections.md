---
title: "Product collections"
description: "Curated marketplace product records, catalog UI, import pipeline, persistence, and current read-only constraints."
---

Product collections are curated affiliate-research catalogs. Each collection
groups marketplace items with commercial metadata, source imagery, and a
generated lifestyle visual.

## Record shape

```ts
type ProductCollection = {
  ownerId?: string
  id: string
  name: string
  description: string
  items: ProductCollectionItem[]
  createdAt: string
  updatedAt: string
  commissionDisclaimer: string
  commissionSourceUrl?: string
}

type ProductCollectionItem = {
  id: string
  marketplace: "amazon" | "shopee"
  marketplaceUrl: string
  name: string
  currency: "SGD"
  price: number
  priceLabel: string
  commissionRate: number
  estimatedCommission: number
  storeImageUrl: string
  generatedImageUrl: string
  useCase: string
  sourcedAt: string
}
```

The current normalizer requires collection `id`, `name`, and `items`, and drops
items missing an ID, marketplace URL, store image, or generated image.

## Product UI

The Products tab is read-only. A collection card shows up to three generated
images, its name, item count, and description. Opening it shows every item with:

- generated lifestyle image;
- product name and intended use case;
- captured price;
- estimated commission and rate;
- marketplace link;
- collection-level pricing/commission disclaimer and source link.

Marketplace links open externally with sponsored-link relationship metadata.
Prices and commission estimates are snapshots, not live quotes.

## CRUD support

| Action | Current support                                                   |
| ------ | ----------------------------------------------------------------- |
| Create | Operational importer only                                         |
| Read   | `GET /api/product-collections` and Products tab                   |
| Update | Re-run/extend the importer; no app control or public mutation API |
| Delete | No supported UI or API operation                                  |

## Import pipeline

`scripts/import-product-collections.mjs` is a curated seed/refresh tool. It:

1. requires `LUMENCLIP_SYSTEM_OWNER_ID` and Appwrite server credentials;
2. reads a source JSON file (default `/tmp/lumenclip-product-source.json`);
3. currently requires exactly five collections;
4. downloads and converts store images to WebP;
5. calls the Higgsfield `nano_banana_2` model to generate 4:5 lifestyle images;
6. uploads store/generated images to the `product_images` bucket;
7. caches complete existing items and upserts collection progress.

The script's current fixture expectations and disclaimer are campaign-specific:
five collections, ten products per collection, SGD/Amazon.sg data captured on
13 July 2026. Treat those as importer constraints, not a general product-domain
guarantee.

## Persistence mismatch

Application reads use the logical product store, mapped to owner-scoped
`permanent_assets` rows with `source_key=product_collection`. The current import
script writes the dedicated `product_collections` table. This drift can make a
successful import invisible to `GET /api/product-collections` in a schema that
uses only the consolidated route.

Before running or modifying the importer:

1. inspect the environment's active table schema;
2. choose the consolidated store as the source of truth;
3. migrate any dedicated-table rows rather than maintaining two writable
   copies;
4. verify the Products tab as the end-to-end read check.

## Automation use

Product collections are not currently referenced by automation schemas, loaded
by the scheduler/job worker, or sent to publishing. The UI's example
`[[product]]` token is a [variable collection](variable-collections.md), not a
link to this catalog.

## Known limitations

- Read-only product surface and route.
- No freshness sync, price history, inventory status, or marketplace webhook.
- Currency type is currently fixed to `SGD` even though the marketplace union
  includes Shopee.
- Commission is estimated and must retain the visible disclaimer.
- Importer and application record locations are not yet aligned.
