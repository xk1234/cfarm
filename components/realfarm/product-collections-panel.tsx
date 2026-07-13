"use client"

import { useState } from "react"
import {
  IconArrowUpRight,
  IconBrandAmazon,
  IconCurrencyDollarSingapore,
  IconPackage,
  IconX,
} from "@tabler/icons-react"

import { AppModal, AppModalPanel } from "@/components/ui/modal"
import type { ProductCollection } from "@/lib/product-collections"

export function ProductCollectionsPanel({
  collections,
}: {
  collections: ProductCollection[]
}) {
  const [selected, setSelected] = useState<ProductCollection | null>(null)

  if (collections.length === 0) {
    return (
      <div className="app-empty-state grid min-h-[360px] place-items-center text-center">
        <div>
          <IconPackage className="mx-auto size-9 text-app-muted-text" />
          <h2 className="mt-3 text-[18px] font-semibold">No product collections yet</h2>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5">
        {collections.map((collection) => (
          <button
            key={collection.id}
            type="button"
            onClick={() => setSelected(collection)}
            className="group overflow-hidden rounded-[10px] border border-app-panel-border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="grid aspect-[16/9] grid-cols-3 gap-1 bg-[#efeee8] p-1">
              {collection.items.slice(0, 3).map((item) => (
                // eslint-disable-next-line @next/next/no-img-element -- Product assets are dynamic Appwrite URLs.
                <img
                  key={item.id}
                  src={item.generatedImageUrl}
                  alt=""
                  className="h-full min-w-0 object-cover"
                />
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[15px] font-bold text-app-text">{collection.name}</h2>
                <span className="shrink-0 rounded-full bg-[#f1f0eb] px-2 py-1 text-[10px] font-bold text-app-muted-text">
                  {collection.items.length} items
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[12px] leading-5 font-medium text-app-muted-text">
                {collection.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <ProductCollectionModal collection={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}

function ProductCollectionModal({
  collection,
  onClose,
}: {
  collection: ProductCollection
  onClose: () => void
}) {
  return (
    <AppModal className="z-[80]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[92vh] max-w-[1240px] flex-col overflow-hidden rounded-[12px] bg-[#f6f5f0]">
        <header className="flex items-start justify-between gap-5 border-b border-app-panel-border bg-white px-6 py-5">
          <div>
            <h2 className="text-[22px] font-bold text-app-text">{collection.name}</h2>
            <p className="mt-1 max-w-[760px] text-[13px] leading-5 font-medium text-app-muted-text">
              {collection.description}
            </p>
            <p className="mt-2 text-[10px] font-medium text-[#9a9991]">
              {collection.commissionDisclaimer}
              {collection.commissionSourceUrl ? (
                <>
                  {" "}
                  <a
                    href={collection.commissionSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline underline-offset-2 hover:text-app-text"
                  >
                    Amazon.sg fee schedule
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-[7px] text-app-muted-text hover:bg-app-control-hover"
            onClick={onClose}
            aria-label="Close product collection"
          >
            <IconX className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {collection.items.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[10px] border border-app-panel-border bg-white shadow-sm">
                <div className="aspect-[4/3] bg-app-panel-border">
                  <ProductImage
                    imageUrl={item.generatedImageUrl}
                    label="In use"
                    alt={`${item.name} styled in a home`}
                  />
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-2 min-h-10 text-[14px] leading-5 font-bold text-app-text">{item.name}</h3>
                  <p className="mt-2 line-clamp-3 min-h-[54px] text-[12px] leading-[18px] font-medium text-app-muted-text">{item.useCase}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <ProductMetric label="Price" value={item.priceLabel} />
                    <ProductMetric label={`Est. commission · ${(item.commissionRate * 100).toFixed(1)}%`} value={`S$${item.estimatedCommission.toFixed(2)}`} />
                  </div>
                  <a
                    href={item.marketplaceUrl}
                    target="_blank"
                    rel="noreferrer sponsored"
                    className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[7px] bg-[#151513] px-3 text-[12px] font-semibold text-white transition hover:bg-black"
                  >
                    <IconBrandAmazon className="size-4" />
                    View on Amazon
                    <IconArrowUpRight className="size-3.5" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function ProductImage({
  imageUrl,
  label,
  alt,
}: {
  imageUrl: string
  label: string
  alt: string
}) {
  return (
    <div className="relative overflow-hidden bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- Product assets are dynamic Appwrite URLs. */}
      <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-white backdrop-blur-sm">{label}</span>
    </div>
  )
}

function ProductMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] bg-[#f4f3ee] px-3 py-2">
      <div className="flex items-center gap-1 text-[9px] font-bold tracking-[0.06em] text-app-muted-text uppercase">
        <IconCurrencyDollarSingapore className="size-3" />
        {label}
      </div>
      <div className="mt-1 font-mono text-[13px] font-bold text-app-text">{value}</div>
    </div>
  )
}
