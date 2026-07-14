"use client"

import { Check, ChevronDown, Search } from "lucide-react"
import type { ComponentProps } from "react"
import { Select, Switch } from "radix-ui"

import { Button } from "@/components/ui/button"
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
    <Switch.Root
      checked={Boolean(enabled)}
      className={cn(
        "inline-flex h-7 w-12 shrink-0 rounded-full p-1 transition outline-none focus-visible:ring-3 focus-visible:ring-app-action/25",
        enabled ? "bg-app-action" : "bg-[#ececea]",
        className
      )}
      {...props}
    >
      <Switch.Thumb
        className={cn(
          "block size-5 rounded-full bg-white shadow-sm transition-transform",
          enabled && "translate-x-5"
        )}
      />
    </Switch.Root>
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
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger asChild>
        <Button
          variant="softControl"
          size="appDefault"
          className="w-full justify-start text-left"
        >
          <Select.Value />
        </Button>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          side={placement === "bottom" ? "bottom" : "top"}
          sideOffset={8}
          className={cn(
            "z-[120] min-w-32 overflow-hidden rounded-lg border border-app-panel-border bg-app-control-bg p-1 text-sm shadow-xl"
          )}
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option}
                value={option}
                className="cursor-default rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-app-control-hover"
              >
                <Select.ItemText>{option}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger asChild>
        <Button
          type="button"
          variant="softControl"
          size="appDefault"
          className={cn("justify-between gap-2", className)}
        >
          <Select.Value />
          <Select.Icon asChild>
            <ChevronDown className="size-4 text-[#77766f]" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          align="end"
          className="z-[120] min-w-[142px] overflow-hidden rounded-lg border border-app-panel-border bg-app-control-bg py-1 text-sm shadow-xl"
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option}
                value={option}
                className="flex h-8 w-full items-center justify-between gap-4 px-3 text-left hover:bg-app-control-hover"
              >
                <Select.ItemText>{option}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="size-3.5 text-[#242421]" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
