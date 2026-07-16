import { IconChevronRight } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

export function AutomationSettingsNavButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-[6px] border border-transparent px-3 text-left text-[14px] font-semibold",
        active
          ? "border-[#92918a] bg-app-surface text-app-text"
          : "text-[#7b7a73] hover:bg-white/70",
        disabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
      {active && <IconChevronRight className="ml-auto size-4" />}
    </button>
  )
}
