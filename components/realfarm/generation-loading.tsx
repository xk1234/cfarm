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
        "relative overflow-hidden rounded-[12px] border border-[#e5e2d9] bg-app-surface",
        compact ? "p-3" : "p-5 shadow-[0_10px_30px_rgba(53,47,35,0.06)]",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(246,119,91,0.08)_45%,transparent_70%)] bg-[length:220%_100%] motion-safe:animate-pulse" />
      <div className="relative flex items-center gap-3">
        <div className={cn("relative shrink-0", compact ? "size-8" : "size-11")} aria-hidden="true">
          <div className="absolute inset-0 rounded-[10px] bg-[#fff0eb]" />
          <div className="absolute inset-[7px] rotate-6 rounded-[4px] bg-[#f26c4f] shadow-[6px_5px_0_rgba(249,179,86,0.65)] motion-safe:animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("font-bold text-app-text", compact ? "text-[12px]" : "text-[14px]")}>{title}</div>
          <div className={cn("mt-0.5 leading-5 font-medium text-app-muted-text", compact ? "text-[10px]" : "text-[12px]")}> 
            {description}
          </div>
          {!compact ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f0eee7]">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#f26c4f] via-[#f59b63] to-[#efc66f] motion-safe:animate-pulse" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
