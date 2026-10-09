"use client"

import { useMemo } from "react"

import {
  buildActivityGrid,
  currentStreak,
  type ActivityDay,
} from "@/lib/post-frequency"
import { cn } from "@/lib/utils"

const levelClass = [
  "bg-app-control-hover",
  "bg-app-strong/25",
  "bg-app-strong/45",
  "bg-app-strong/70",
  "bg-app-strong",
]

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function describe(day: ActivityDay) {
  const when = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  if (day.count === 0) return `No posts on ${when}`
  return `${day.count} post${day.count === 1 ? "" : "s"} on ${when}`
}

/**
 * Posting cadence as a contribution grid.
 *
 * Cadence is the thing this dashboard is actually about, and a sentence of
 * copy cannot show a gap. The grid makes a missed week obvious at a glance.
 */
export function PostFrequencyGraph({
  dates,
  weeks = 26,
  className,
}: {
  dates: Array<string | undefined | null>
  weeks?: number
  className?: string
}) {
  const grid = useMemo(
    () => buildActivityGrid(dates, { weeks }),
    [dates, weeks]
  )
  const streak = useMemo(() => currentStreak(grid), [grid])

  // Label a column only when its month differs from the previous column, so
  // labels land once per month rather than on every week.
  const columnMonths = grid.weeks.map((week, index) => {
    const month = new Date(`${week[0].date}T00:00:00`).getMonth()
    if (index === 0) return monthLabels[month]
    const previous = new Date(
      `${grid.weeks[index - 1][0].date}T00:00:00`
    ).getMonth()
    return month === previous ? "" : monthLabels[month]
  })
  const visibleMonthLabels = columnMonths.flatMap((label, index) =>
    label ? [{ index, label }] : []
  )
  const activeDays = grid.weeks.flat().filter((day) => day.count > 0)
  const weekColumns = {
    gridTemplateColumns: `23px repeat(${grid.weeks.length}, minmax(0, 1fr))`,
  }

  return (
    <section className={cn("mx-auto max-w-[980px]", className)}>
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        <span className="text-[28px] leading-none font-semibold tracking-[-0.04em] text-app-text sm:text-[34px]">
          {grid.total}
        </span>
        <span className="text-[15px] font-medium text-app-muted-text">
          {grid.total === 1 ? "post" : "posts"} in the last {weeks} weeks
        </span>
        {streak > 0 ? (
          <span className="rounded-full bg-app-strong/10 px-2.5 py-0.5 text-[12px] font-semibold text-app-strong">
            {streak}-day streak
          </span>
        ) : null}
      </div>

      <div className="mx-auto mt-5 w-[283px] max-w-full min-[420px]:w-[387px]">
        <div
          className="grid gap-x-[2px] min-[420px]:gap-x-[3px]"
          style={weekColumns}
          aria-hidden="true"
        >
          {visibleMonthLabels.map(({ index, label }, labelIndex) => (
            <span
              key={`${label}-${index}`}
              className={cn(
                "row-start-1 min-w-max text-[9px] leading-4 font-medium text-app-muted-text",
                labelIndex === visibleMonthLabels.length - 1 &&
                  "justify-self-end"
              )}
              style={{ gridColumnStart: index + 2 }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="mt-0.5 flex gap-[2px] min-[420px]:gap-[3px]">
          <div className="grid w-[23px] shrink-0 grid-rows-7 gap-[2px] pr-1 text-right min-[420px]:gap-[3px]">
            {["", "Mon", "", "Wed", "", "Fri", ""].map((label, index) => (
              <span
                key={index}
                className="h-[8px] self-center text-[9px] leading-[8px] font-medium text-app-muted-text min-[420px]:h-[11px] min-[420px]:leading-[11px]"
              >
                {label}
              </span>
            ))}
          </div>
          <div
            className="grid min-w-0 flex-1 gap-[2px] min-[420px]:gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(0, 1fr))`,
            }}
            role="img"
            aria-label={`${grid.total} posts across ${activeDays.length} active days in the last ${weeks} weeks`}
          >
            {grid.weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className="flex min-w-0 flex-col items-center gap-[2px] min-[420px]:gap-[3px]"
              >
                {week.map((day) => (
                  <span
                    key={day.date}
                    title={describe(day)}
                    aria-hidden="true"
                    className={cn(
                      "size-[8px] rounded-[2px] min-[420px]:size-[11px]",
                      levelClass[day.level]
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-app-muted-text">
        <span>Less</span>
        {levelClass.map((cls, index) => (
          <span key={index} className={cn("size-[11px] rounded-[2px]", cls)} />
        ))}
        <span>More</span>
      </div>
      <p className="sr-only">
        {activeDays.length
          ? activeDays.map(describe).join("; ")
          : `No posts in the last ${weeks} weeks.`}
      </p>
    </section>
  )
}
