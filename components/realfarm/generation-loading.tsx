import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export function StandardGenerationLoadingScreen({
  title = "Generating",
  description = "Building the next output and preparing the preview.",
  compact,
  className,
}: {
  title?: string
  description?: string
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-[#e2e1da] bg-[#fbfbf7]",
        compact ? "p-4" : "p-6",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn("flex items-center gap-3", !compact && "flex-col text-center")}>
        <Spinner size={compact ? 22 : 30} aria-label={title} />
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-[#242421]">{title}</div>
          <div className="mt-0.5 text-[12px] leading-5 font-semibold text-[#77766f]">
            {description}
          </div>
        </div>
      </div>
    </div>
  )
}
