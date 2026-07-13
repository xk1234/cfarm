"use client"

import { Check, ChevronDown, Search } from "lucide-react"
import type { ComponentProps } from "react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useDismissableLayer } from "@/components/ui/dismissable"
import { cn } from "@/lib/utils"

export function SwitchPill({ enabled }: { enabled?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 w-12 shrink-0 rounded-full p-1",
        enabled ? "bg-app-action" : "bg-[#ececea]"
      )}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-white shadow-sm transition",
          enabled && "translate-x-5"
        )}
      />
    </span>
  )
}

export function SwitchPillButton({
  enabled,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & { enabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(enabled)}
      className={cn("shrink-0", className)}
      {...props}
    >
      <SwitchPill enabled={enabled} />
    </button>
  )
}

export function ToggleRow({
  label,
  enabled,
  onToggle,
}: {
  label: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex h-9 w-full items-center justify-between border-b border-[#ecebe4] text-left text-[13px] font-semibold">
      <span>{label}</span>
      <SwitchPillButton
        enabled={enabled}
        onClick={onToggle}
        aria-label={`Toggle ${label}`}
      />
    </div>
  )
}

export function SelectLike({
  value,
  options,
  onChange,
  placement = "top",
}: {
  value: string
  options: string[]
  onChange?: (value: string) => void
  placement?: "top" | "bottom"
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismissableLayer<HTMLDivElement>(() => setOpen(false), open)
  return (
    <div ref={ref} className="relative">
      <Button
        variant="softControl"
        size="appDefault"
        className="w-full justify-start text-left"
        onClick={() => setOpen((current) => !current)}
      >
        {value}
      </Button>
      {open && (
        <div
          className={cn(
            "absolute left-0 z-20 w-32 rounded-lg border border-app-panel-border bg-app-control-bg p-1 text-sm shadow-xl",
            placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          )}
        >
          {options.map((option) => (
            <button
              key={option}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-app-control-hover"
              onClick={() => {
                onChange?.(option)
                setOpen(false)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LabelledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange?: (value: string) => void
}) {
  return (
    <label className="text-[11px] font-semibold text-[#6c6b66]">
      {label}
      <SelectLike value={value} options={options} onChange={onChange} />
    </label>
  )
}

export function CheckedDropdownButton({
  value,
  options,
  onChange,
  className,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismissableLayer<HTMLDivElement>(() => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="softControl"
        size="appDefault"
        className={cn("justify-between gap-2", className)}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <ChevronDown className="size-4 text-[#77766f]" />
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 min-w-[142px] overflow-hidden rounded-lg border border-app-panel-border bg-app-control-bg py-1 text-sm shadow-xl">
          {options.map((option) => (
            <button
              key={option}
              className="flex h-8 w-full items-center justify-between gap-4 px-3 text-left hover:bg-app-control-hover"
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              <span>{option}</span>
              {option === value && (
                <Check className="size-3.5 text-[#242421]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SelectControl({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-app-panel-border bg-app-control-bg px-4 text-sm font-medium outline-none",
        className
      )}
      {...props}
    />
  )
}

export function SearchControl({
  className,
  inputClassName,
  ...props
}: ComponentProps<"input"> & {
  inputClassName?: string
}) {
  return (
    <label
      className={cn(
        "relative block h-9 rounded-lg border border-app-panel-border bg-app-control-bg shadow-sm focus-within:border-app-muted-text",
        className
      )}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-muted-text" />
      <input
        className={cn(
          "h-full w-full rounded-lg bg-transparent pr-3 pl-9 text-sm font-medium text-app-text outline-none placeholder:text-app-text-faint",
          inputClassName
        )}
        {...props}
      />
    </label>
  )
}

export function FormatSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange?: (value: string) => void
}) {
  return (
    <SelectControl
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </SelectControl>
  )
}

export function FormatLabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange?: (value: string) => void
}) {
  return (
    <label>
      <div className="mb-1 text-[11px] font-semibold text-[#6b6a64]">
        {label}
      </div>
      <FormatSelect value={value} options={options} onChange={onChange} />
    </label>
  )
}
