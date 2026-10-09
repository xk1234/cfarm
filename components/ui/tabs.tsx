"use client"

import * as React from "react"
import { Tabs as RadixTabs } from "radix-ui"

import { cn } from "@/lib/utils"

const Tabs = RadixTabs.Root

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        "flex min-h-10 items-end gap-6 border-b border-app-panel-border",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "lc-focus-ring relative -mb-px min-h-10 border-b-2 border-transparent px-0.5 text-sm font-semibold text-app-muted-text transition-colors hover:text-app-text data-[state=active]:border-app-action data-[state=active]:text-app-text",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content className={cn("outline-none", className)} {...props} />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
