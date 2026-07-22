"use client"

import { useMemo, useState } from "react"
import { IconLink, IconPhoto, IconVideo } from "@tabler/icons-react"

import { PlatformPreview } from "@/components/realfarm/previews/platform-preview"
import { Button } from "@/components/ui/button"
import { MediaCard, MediaCardPreview } from "@/components/ui/media-card"
import { SocialPlatformIcon } from "@/components/realfarm/social-platform"
import { getSocialProvider } from "@/lib/social/registry"
import { cn } from "@/lib/utils"

import {
  effectiveNetworkText,
  networkValueFor,
  updateNetworkValue,
} from "./composer-types"
import type {
  ComposerValue,
  ConnectedComposerAccount,
  NetworkComposerValue,
} from "./composer-types"

export type { ComposerValue, ConnectedComposerAccount } from "./composer-types"

export function PostComposer({
  accounts,
  onChange,
  value,
}: {
  accounts: readonly ConnectedComposerAccount[]
  onChange: (value: ComposerValue) => void
  value: ComposerValue
}) {
  const availableAccounts = useMemo(
    () => accounts.filter((account) => getSocialProvider(account.platformKey)),
    [accounts]
  )
  const [activeKey, setActiveKey] = useState(
    availableAccounts[0]?.integrationId
  )
  const activeAccount =
    availableAccounts.find((account) => account.integrationId === activeKey) ??
    availableAccounts[0]
  const provider = activeAccount
    ? getSocialProvider(activeAccount.platformKey)
    : undefined
  const network = activeAccount
    ? networkValueFor(value, activeAccount.platformKey)
    : undefined
  const effectiveText = activeAccount
    ? effectiveNetworkText(value, activeAccount.platformKey)
    : value.base.text
  const textCount = effectiveText.length
  const overLimit = provider ? textCount > provider.limits.maxTextLength : false

  function updateNetwork(update: Partial<NetworkComposerValue>) {
    if (!activeAccount) return
    onChange(updateNetworkValue(value, activeAccount.platformKey, update))
  }

  if (!activeAccount || !provider || !network) {
    return (
      <section className="rounded-app-panel border border-app-panel-border bg-app-surface p-8 text-center">
        <h2 className="text-heading font-semibold text-app-text">
          No connected networks
        </h2>
        <p className="mt-2 text-label text-app-muted-text">
          Connect a publishable account to start composing.
        </p>
      </section>
    )
  }

  const effectiveMedia = network.media.length ? network.media : value.base.media

  return (
    <section
      aria-label="Post composer"
      className="overflow-hidden rounded-app-panel border border-app-panel-border bg-app-surface shadow-app-card"
    >
      <div className="border-b border-app-panel-border p-5">
        <p className="text-caption font-semibold tracking-wide text-app-muted-text uppercase">
          Write once
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <label className="flex-1">
            <span className="text-heading font-semibold text-app-text">
              Master message
            </span>
            <span className="mt-1 block text-caption text-app-muted-text">
              Every network inherits this message until you add an override.
            </span>
            <textarea
              aria-label="Master message"
              className="lc-focus-ring mt-4 min-h-36 w-full resize-y rounded-app-control border border-app-panel-border bg-app-surface-subtle p-4 text-label text-app-text outline-none placeholder:text-app-text-faint"
              onChange={(event) =>
                onChange({
                  ...value,
                  base: { ...value.base, text: event.target.value },
                })
              }
              placeholder="What do you want to share?"
              value={value.base.text}
            />
          </label>
        </div>
        <MediaUrlEditor
          label="Shared media URL"
          media={value.base.media}
          onChange={(media) =>
            onChange({ ...value, base: { ...value.base, media } })
          }
        />
      </div>

      <div className="border-b border-app-panel-border bg-app-surface-subtle px-5 pt-4">
        <p className="text-caption font-semibold text-app-muted-text">
          Customize by network
        </p>
        <div
          aria-label="Connected networks"
          className="mt-3 flex gap-1 overflow-x-auto"
          role="tablist"
        >
          {availableAccounts.map((account) => {
            const item = getSocialProvider(account.platformKey)
            const selected = account.integrationId === activeAccount.integrationId
            const accountText = effectiveNetworkText(value, account.platformKey)
            const tabId = safeId(account.integrationId)
            return (
              <button
                aria-controls={`network-panel-${tabId}`}
                aria-selected={selected}
                className={cn(
                  "lc-focus-ring -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-label font-semibold transition-colors",
                  selected
                    ? "border-brand-accent text-brand-accent"
                    : "border-transparent text-app-muted-text hover:text-app-text"
                )}
                id={`network-tab-${tabId}`}
                key={account.integrationId}
                onClick={() => setActiveKey(account.integrationId)}
                role="tab"
                type="button"
              >
                <span className="grid size-6 place-items-center overflow-hidden rounded-app-control bg-app-control-bg">
                  {account.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="size-full object-cover"
                      src={account.avatarUrl}
                    />
                  ) : (
                    <SocialPlatformIcon
                      className="size-3.5"
                      provider={account.platformKey}
                    />
                  )}
                </span>
                <span>{item?.name}</span>
                <span className="font-mono text-caption font-medium tabular-nums text-app-muted-text">
                  {accountText.length.toLocaleString()} /{" "}
                  {item?.limits.maxTextLength.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <div
          aria-labelledby={`network-tab-${safeId(activeAccount.integrationId)}`}
          className="space-y-5 p-5 lg:border-r lg:border-app-panel-border"
          id={`network-panel-${safeId(activeAccount.integrationId)}`}
          role="tabpanel"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-heading font-semibold text-app-text">
                {provider.name} override
              </h2>
              <p className="text-caption text-app-muted-text">
                Posting as {activeAccount.handle}
              </p>
            </div>
            <Button
              aria-pressed={network.useTextOverride}
              onClick={() =>
                updateNetwork({ useTextOverride: !network.useTextOverride })
              }
              size="appDefault"
              variant={network.useTextOverride ? "action" : "softControl"}
            >
              {network.useTextOverride ? "Using override" : "Use custom text"}
            </Button>
          </div>

          <label className="block">
            <span className="text-label font-semibold text-app-text">
              Post text
            </span>
            <textarea
              aria-describedby={`character-count-${activeAccount.platformKey}`}
              aria-invalid={overLimit}
              aria-label={`${provider.name} post text`}
              className={cn(
                "lc-focus-ring mt-2 min-h-40 w-full resize-y rounded-app-control border bg-app-surface p-4 text-label text-app-text outline-none disabled:cursor-not-allowed disabled:bg-app-surface-subtle disabled:text-app-muted-text",
                overLimit ? "border-app-danger" : "border-app-panel-border"
              )}
              disabled={!network.useTextOverride}
              onChange={(event) => updateNetwork({ text: event.target.value })}
              value={network.useTextOverride ? network.text : value.base.text}
            />
            <span
              className={cn(
                "mt-2 flex justify-end text-caption font-semibold",
                overLimit ? "text-app-danger" : "text-app-muted-text"
              )}
              id={`character-count-${activeAccount.platformKey}`}
              role={overLimit ? "alert" : undefined}
            >
              {textCount.toLocaleString()} /{" "}
              {provider.limits.maxTextLength.toLocaleString()}
              {overLimit
                ? ` — ${textCount - provider.limits.maxTextLength} over limit`
                : ""}
            </span>
          </label>

          <MediaUrlEditor
            label={`${provider.name} media override`}
            media={network.media}
            onChange={(media) => updateNetwork({ media })}
          />

          <PlatformFields
            fields={network.fields}
            previewKind={provider.previewKind}
            update={(fields) => updateNetwork({ fields })}
          />
        </div>

        <aside className="bg-app-surface-subtle p-5">
          <div className="sticky top-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-label font-semibold text-app-text">
                  Live preview
                </p>
                <p className="text-caption text-app-muted-text">
                  {provider.name} post chrome
                </p>
              </div>
              <span className="rounded-full bg-brand-accent-soft px-3 py-1 text-caption font-semibold text-brand-accent">
                Inherited + overrides
              </span>
            </div>
            <PlatformPreview
              accountName={activeAccount.accountName}
              avatarUrl={activeAccount.avatarUrl}
              fields={network.fields}
              handle={activeAccount.handle}
              media={effectiveMedia}
              platformKey={activeAccount.platformKey}
              text={effectiveText}
            />
          </div>
        </aside>
      </div>
    </section>
  )
}

function MediaUrlEditor({
  label,
  media,
  onChange,
}: {
  label: string
  media: NetworkComposerValue["media"]
  onChange: (media: NetworkComposerValue["media"]) => void
}) {
  const item = media[0]
  return (
    <div className="mt-4">
      <label
        className="text-label font-semibold text-app-text"
        htmlFor={`${label.replaceAll(" ", "-")}-url`}
      >
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-app-control bg-app-control-bg text-app-muted-text">
          <IconLink className="size-4" aria-hidden />
        </span>
        <input
          className="lc-focus-ring h-10 min-w-0 flex-1 rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text outline-none placeholder:text-app-text-faint"
          id={`${label.replaceAll(" ", "-")}-url`}
          onChange={(event) =>
            onChange(
              event.target.value
                ? [
                    {
                      id: "media-1",
                      kind: item?.kind ?? "image",
                      url: event.target.value,
                      alt: "Post media",
                    },
                  ]
                : []
            )
          }
          placeholder="https://…"
          type="url"
          value={item?.url ?? ""}
        />
        <Button
          aria-label={`Use image for ${label}`}
          onClick={() => item && onChange([{ ...item, kind: "image" }])}
          size="icon"
          type="button"
          variant={item?.kind !== "video" ? "action" : "softControl"}
        >
          <IconPhoto />
        </Button>
        <Button
          aria-label={`Use video for ${label}`}
          onClick={() => item && onChange([{ ...item, kind: "video" }])}
          size="icon"
          type="button"
          variant={item?.kind === "video" ? "action" : "softControl"}
        >
          <IconVideo />
        </Button>
      </div>
      {item?.url ? (
        <MediaCard className="mt-3 max-w-44" radius="media" surface="flat">
          <MediaCardPreview
            alt={item.alt ?? "Post media"}
            aspect="wide"
            imageSrc={item.kind === "image" ? item.url : undefined}
            videoSrc={item.kind === "video" ? item.url : undefined}
          />
        </MediaCard>
      ) : null}
    </div>
  )
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function PlatformFields({
  fields,
  previewKind,
  update,
}: {
  fields: Record<string, string>
  previewKind: string
  update: (fields: Record<string, string>) => void
}) {
  const specs =
    previewKind === "youtube"
      ? [
          {
            key: "title",
            label: "Video title",
            placeholder: "Add a searchable video title",
          },
        ]
      : previewKind === "linkedin"
        ? [{ key: "audience", label: "Audience", placeholder: "Anyone" }]
        : previewKind === "tiktok"
          ? [{ key: "visibility", label: "Visibility", placeholder: "Public" }]
          : [
              {
                key: "firstComment",
                label: "First comment",
                placeholder: "Optional follow-up comment",
              },
            ]
  return (
    <fieldset className="space-y-3">
      <legend className="text-label font-semibold text-app-text">
        Platform settings
      </legend>
      {specs.map((spec) => (
        <label className="block" key={spec.key}>
          <span className="text-caption text-app-muted-text">{spec.label}</span>
          <input
            className="lc-focus-ring mt-1 h-10 w-full rounded-app-control border border-app-panel-border bg-app-surface px-3 text-label text-app-text outline-none placeholder:text-app-text-faint"
            onChange={(event) =>
              update({ ...fields, [spec.key]: event.target.value })
            }
            placeholder={spec.placeholder}
            value={fields[spec.key] ?? ""}
          />
        </label>
      ))}
    </fieldset>
  )
}
