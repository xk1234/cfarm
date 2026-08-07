"use client"

import { useMemo, useState, type ReactNode } from "react"
import { IconChevronDown, IconRefresh, IconSparkles } from "@tabler/icons-react"
import { Accordion, Tabs } from "radix-ui"

import { PlatformPreview } from "@/components/realfarm/previews/platform-preview"
import { SocialPlatformIcon } from "@/components/realfarm/social-platform"
import { Button } from "@/components/ui/button"
import { getSocialProvider } from "@/lib/social/registry"
import { cn } from "@/lib/utils"

import {
  effectiveNetworkText,
  networkValueFor,
  updateNetworkValue,
} from "./composer-types"
import type {
  ComposerSourceOutput,
  ComposerValue,
  ConnectedComposerAccount,
  NetworkComposerValue,
} from "./composer-types"

export type { ComposerValue, ConnectedComposerAccount } from "./composer-types"

export function PostComposer({
  accounts,
  editorFooter,
  editorHeader,
  onChange,
  onRepurpose,
  repurposing,
  sources,
  value,
}: {
  accounts: readonly ConnectedComposerAccount[]
  editorFooter?: ReactNode
  editorHeader?: ReactNode
  onChange: (value: ComposerValue) => void
  onRepurpose: () => void
  repurposing: boolean
  sources: readonly ComposerSourceOutput[]
  value: ComposerValue
}) {
  const availableAccounts = useMemo(
    () => accounts.filter((account) => getSocialProvider(account.platformKey)),
    [accounts]
  )
  const [activeKey, setActiveKey] = useState(
    availableAccounts[0]?.integrationId ?? ""
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

  if (!activeAccount || !provider || !network) return null

  return (
    <section
      aria-label="Post composer"
      className="grid items-stretch gap-4 xl:grid-cols-2"
    >
      <div className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-app-panel border border-app-panel-border bg-app-surface shadow-app-card">
        {editorHeader ? (
          <div className="border-b border-app-panel-border p-4 sm:p-5">
            {editorHeader}
          </div>
        ) : null}
        <Tabs.Root
          className="flex min-h-0 flex-1 flex-col"
          onValueChange={setActiveKey}
          value={activeAccount.integrationId}
        >
          <div className="border-b border-app-panel-border px-4 pt-4">
            <Tabs.List
              aria-label="Network to customize"
              className="flex gap-1 overflow-x-auto"
            >
              {availableAccounts.map((account) => {
                const selected =
                  account.integrationId === activeAccount.integrationId
                const item = getSocialProvider(account.platformKey)
                const accountText = effectiveNetworkText(
                  value,
                  account.platformKey
                )
                return (
                  <Tabs.Trigger
                    className={cn(
                      "lc-focus-ring -mb-px flex min-w-0 shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-label font-semibold transition-colors",
                      selected
                        ? "border-brand-accent text-app-text"
                        : "border-transparent text-app-muted-text hover:text-app-text"
                    )}
                    key={account.integrationId}
                    value={account.integrationId}
                  >
                    <SocialPlatformIcon
                      className="size-4"
                      provider={account.platformKey}
                    />
                    <span>{item?.name}</span>
                    <span className="font-mono text-caption font-medium tabular-nums">
                      {accountText.length}
                    </span>
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>
          </div>

          <Tabs.Content
            className="flex min-h-0 flex-1 flex-col p-4 sm:p-5"
            value={activeAccount.integrationId}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-app-control-bg">
                {activeAccount.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="size-full object-cover"
                    src={activeAccount.avatarUrl}
                  />
                ) : (
                  <SocialPlatformIcon
                    className="size-4"
                    provider={activeAccount.platformKey}
                  />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-label font-semibold text-app-text">
                  {activeAccount.accountName}
                </p>
                <p className="truncate text-caption text-app-muted-text">
                  {activeAccount.handle}
                </p>
              </div>
            </div>

            {sources.length > 0 ? (
              <>
                <label className="block">
                  <span className="sr-only">{provider.name} post text</span>
                  <textarea
                    aria-describedby={`character-count-${activeAccount.platformKey}`}
                    aria-invalid={overLimit}
                    aria-label={`${provider.name} post text`}
                    className={cn(
                      "lc-focus-ring min-h-64 w-full resize-y border-0 bg-transparent p-0 text-[15px] leading-6 text-app-text outline-none placeholder:text-app-text-faint",
                      overLimit && "text-app-danger"
                    )}
                    onChange={(event) =>
                      updateNetwork({
                        useTextOverride: true,
                        text: event.target.value,
                      })
                    }
                    value={effectiveText}
                  />
                </label>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-app-panel-border pt-3">
                  <span
                    className={cn(
                      "text-caption font-semibold tabular-nums",
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
                  <Button
                    disabled={repurposing}
                    onClick={onRepurpose}
                    size="appDefault"
                    type="button"
                    variant="softControl"
                  >
                    {repurposing ? (
                      <IconRefresh className="animate-spin" />
                    ) : (
                      <IconSparkles />
                    )}
                    Repurpose
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center py-16 text-center">
                <p className="text-label font-semibold text-app-muted-text">
                  Choose a template output to start
                </p>
              </div>
            )}
          </Tabs.Content>
        </Tabs.Root>
        {editorFooter ? (
          <div className="border-t border-app-panel-border p-4 sm:p-5">
            {editorFooter}
          </div>
        ) : null}
      </div>

      <aside className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-app-panel border border-app-panel-border bg-app-surface shadow-app-card">
        <Tabs.Root
          className="flex min-h-0 flex-1 flex-col"
          defaultValue="preview"
        >
          <Tabs.List
            aria-label="Post preview and settings"
            className="grid grid-cols-2 border-b border-app-panel-border px-4 pt-3 sm:px-5"
          >
            <Tabs.Trigger
              className="lc-focus-ring -mb-px border-b-2 border-transparent px-4 py-3 text-label font-semibold text-app-muted-text transition-colors data-[state=active]:border-brand-accent data-[state=active]:text-brand-accent"
              value="preview"
            >
              Preview
            </Tabs.Trigger>
            <Tabs.Trigger
              className="lc-focus-ring -mb-px border-b-2 border-transparent px-4 py-3 text-label font-semibold text-app-muted-text transition-colors data-[state=active]:border-brand-accent data-[state=active]:text-brand-accent"
              value="settings"
            >
              Settings
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content
            className="min-h-0 flex-1 bg-app-surface-subtle p-4 sm:p-6"
            value="preview"
          >
            {sources.length > 0 ? (
              <div className="mx-auto max-w-[680px]">
                <PlatformPreview
                  accountName={activeAccount.accountName}
                  avatarUrl={activeAccount.avatarUrl}
                  fields={network.fields}
                  handle={activeAccount.handle}
                  media={value.base.media}
                  platformKey={activeAccount.platformKey}
                  text={effectiveText}
                />
              </div>
            ) : (
              <div className="grid min-h-[560px] place-items-center text-center">
                <p className="text-label font-semibold text-app-muted-text">
                  Preview appears after you choose an output
                </p>
              </div>
            )}
          </Tabs.Content>

          <Tabs.Content
            className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
            forceMount
            value="settings"
          >
            <Accordion.Root type="multiple">
              <Accordion.Item value="source">
                <Accordion.Header>
                  <Accordion.Trigger className="group lc-focus-ring flex w-full items-center justify-between py-3 text-left text-label font-semibold text-app-text">
                    Source material
                    <IconChevronDown className="size-4 text-app-muted-text transition-transform group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="pb-4 text-caption text-app-muted-text">
                  <div className="max-h-64 space-y-4 overflow-y-auto border-l border-app-panel-border pl-4">
                    {sources.length > 0 ? (
                      sources.map((source) => (
                        <div key={source.id}>
                          <p className="font-semibold text-app-text">
                            {source.title}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">
                            {source.text}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p>No source selected</p>
                    )}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
              <Accordion.Item
                className="border-t border-app-panel-border"
                value="platform"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group lc-focus-ring flex w-full items-center justify-between py-3 text-left text-label font-semibold text-app-text">
                    Platform settings
                    <IconChevronDown className="size-4 text-app-muted-text transition-transform group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="pb-4">
                  <PlatformFields
                    fields={network.fields}
                    previewKind={provider.previewKind}
                    update={(fields) => updateNetwork({ fields })}
                  />
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </Tabs.Content>
        </Tabs.Root>
      </aside>
    </section>
  )
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
      <legend className="sr-only">Platform settings</legend>
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
