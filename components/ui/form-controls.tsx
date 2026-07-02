"use client"

import { Check, ChevronDown } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function SwitchPill({ enabled }: { enabled?: boolean }) {
  return (
    <span className={cn("inline-flex h-7 w-12 shrink-0 rounded-full p-1", enabled ? "bg-[#3197f4]" : "bg-[#ececea]")}>
      <span className={cn("size-5 rounded-full bg-white shadow-sm transition", enabled && "translate-x-5")} />
    </span>
  )
}

export function SwitchPillButton({ enabled, onClick }: { enabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={Boolean(enabled)} className="shrink-0">
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
    <button className="flex h-9 w-full items-center justify-between border-b border-[#ecebe4] text-left text-[13px] font-semibold" onClick={onToggle}>
      <span>{label}</span>
      <span className={cn("relative h-6 w-10 rounded-full transition", enabled ? "bg-[#111]" : "bg-[#ecebea]")}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-white shadow transition", enabled ? "left-5" : "left-1")} />
      </span>
    </button>
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
  return (
    <div className="relative">
      <Button variant="softControl" size="appDefault" className="w-full justify-start rounded-[6px] px-3 text-left text-[12px]" onClick={() => setOpen((current) => !current)}>
        {value}
      </Button>
      {open && (
        <div
          className={cn(
            "absolute left-0 z-20 w-32 rounded-[6px] bg-white p-1 text-[12px] shadow-xl",
            placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          )}
        >
          {options.map((option) => (
            <button
              key={option}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-[#f1f0eb]"
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

  return (
    <div className="relative">
      <Button
        type="button"
        variant="softControl"
        size="appDefault"
        className={cn("justify-between gap-2 rounded-[11px] px-4 text-[14px] font-medium", className)}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <ChevronDown className="size-4 text-[#77766f]" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[142px] overflow-hidden rounded-[7px] border border-[#e1e0d8] bg-white py-1 text-[13px] shadow-xl">
          {options.map((option) => (
            <button
              key={option}
              className="flex h-8 w-full items-center justify-between gap-4 px-3 text-left hover:bg-[#eef4ff]"
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              <span>{option}</span>
              {option === value && <Check className="size-3.5 text-[#242421]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function FormatSelect({ value, options, onChange }: { value: string; options: string[]; onChange?: (value: string) => void }) {
  return (
    <select
      className="h-8 rounded-[7px] border border-app-panel-border bg-app-control-bg px-3 text-[12px] font-semibold outline-none"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
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
      <div className="mb-1 text-[11px] font-semibold text-[#6b6a64]">{label}</div>
      <FormatSelect value={value} options={options} onChange={onChange} />
    </label>
  )
}
