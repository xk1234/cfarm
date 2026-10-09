import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function PaginationControls({
  page,
  pageCount,
  onPageChange,
  label,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  label: string
}) {
  if (pageCount <= 1) return null

  const safePage = Math.max(0, Math.min(page, pageCount - 1))
  return (
    <nav aria-label={`${label} pagination`} className="flex items-center gap-1.5">
      <span className="mr-1 text-[10px] font-semibold text-app-text-faint tabular-nums">
        {safePage + 1} / {pageCount}
      </span>
      <Button
        type="button"
        variant="iconControl"
        size="icon-control-sm"
        aria-label={`Previous ${label} page`}
        disabled={safePage === 0}
        onClick={() => onPageChange(safePage - 1)}
      >
        <IconChevronLeft className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="iconControl"
        size="icon-control-sm"
        aria-label={`Next ${label} page`}
        disabled={safePage === pageCount - 1}
        onClick={() => onPageChange(safePage + 1)}
      >
        <IconChevronRight className="size-3.5" />
      </Button>
    </nav>
  )
}
