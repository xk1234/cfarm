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

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="mx-auto w-fit">
          <div className="flex gap-[2px] pl-[21px] sm:gap-[4px] sm:pl-[29px]">
            {columnMonths.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className="w-2 text-[8px] leading-3 font-medium text-app-muted-text sm:w-[13px] sm:text-[10px] sm:leading-4"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-[2px] sm:gap-[4px]">
            <div className="flex w-[19px] shrink-0 flex-col gap-[2px] pr-1 text-right sm:w-[25px] sm:gap-[4px]">
              {["", "Mon", "", "Wed", "", "Fri", ""].map((label, index) => (
                <span
                  key={index}
                  className="h-2 text-[7px] leading-2 font-medium text-app-muted-text sm:h-[13px] sm:text-[9px] sm:leading-[13px]"
                >
                  {label}
                </span>
              ))}
            </div>
            {grid.weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className="flex flex-col gap-[2px] sm:gap-[4px]"
              >
                {week.map((day) => (
                  <span
                    key={day.date}
                    title={describe(day)}
                    aria-label={describe(day)}
                    className={cn(
                      "size-2 rounded-[2px] sm:size-[13px] sm:rounded-[3px]",
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
          <span
            key={index}
            className={cn("size-2 rounded-[2px] sm:size-[11px]", cls)}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  )
}
