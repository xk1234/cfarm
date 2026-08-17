import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { cn } from "@/lib/utils"

const pageWidths = {
  compact: "max-w-[960px]",
  standard: "max-w-[1160px]",
  wide: "max-w-[1280px]",
  canvas: "max-w-[1380px]",
  full: "max-w-[1540px]",
} as const

export function ResponsivePage({
  width = "wide",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  width?: keyof typeof pageWidths
}) {
  return (
    <div
      data-slot="responsive-page"
      className={cn(
        "@container/page mx-auto w-full min-w-0",
        pageWidths[width],
        className
      )}
      {...props}
    />
  )
}

export function ResponsivePageHeader({
  title,
  leading,
  actions,
  className,
  titleClassName,
}: {
  title: ReactNode
  leading?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
}) {
  return (
    <header
      data-slot="responsive-page-header"
      className={cn(
        "mb-5 grid min-w-0 gap-3 @md/page:grid-cols-[minmax(0,1fr)_auto] @md/page:items-center",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <h1
          className={cn(
            "min-w-0 text-[clamp(1.5rem,4vw,1.875rem)] leading-tight font-semibold tracking-[-0.04em] text-app-text",
            titleClassName
          )}
        >
          {title}
        </h1>
      </div>
      {actions ? <ResponsiveActions>{actions}</ResponsiveActions> : null}
    </header>
  )
}

export function ResponsiveActions({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="responsive-actions"
      className={cn(
        "flex w-full min-w-0 flex-wrap items-center gap-2 @md/page:w-auto @md/page:justify-end",
        "[&>*]:max-w-full max-sm:[&>button]:min-h-10",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function ResponsiveControlBar({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="responsive-control-bar"
      className={cn(
        "flex min-w-0 flex-col gap-3 @md/page:flex-row @md/page:items-center @md/page:justify-between",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const gridSizes = {
  small: "[--responsive-grid-min:10rem]",
  card: "[--responsive-grid-min:15rem]",
  panel: "[--responsive-grid-min:18rem]",
} as const

export function ResponsiveGrid({
  min = "card",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  min?: keyof typeof gridSizes
}) {
  return (
    <div
      data-slot="responsive-grid"
      className={cn(
        "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,var(--responsive-grid-min)),1fr))]",
        gridSizes[min],
        className
      )}
      {...props}
    />
  )
}

export function ResponsiveScrollRegion({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="responsive-scroll-region"
      className={cn(
        "max-w-full min-w-0 [scrollbar-gutter:stable] overflow-x-auto overscroll-x-contain",
        className
      )}
      {...props}
    />
  )
}
