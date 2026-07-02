"use client"

import { useMemo, useState } from "react"
import { DateTime } from "luxon"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  IconBolt,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconRefresh,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const scheduledPosts: Record<number, { time: string; color: "pink" | "blue" | "green" | "mint"; channels: ("tiktok" | "instagram")[] }[]> = {
  3: [
    { time: "7:45 AM", color: "pink", channels: ["tiktok", "instagram"] },
    { time: "2:45 PM", color: "blue", channels: ["tiktok"] },
  ],
  4: [
    { time: "8:30 AM", color: "pink", channels: ["tiktok", "instagram"] },
    { time: "1:23 PM", color: "green", channels: ["tiktok"] },
    { time: "1:23 PM", color: "mint", channels: ["tiktok"] },
    { time: "6:15 PM", color: "mint", channels: ["tiktok", "instagram"] },
  ],
  5: [
    { time: "12:30 PM", color: "blue", channels: ["tiktok", "instagram"] },
    { time: "12:30 PM", color: "blue", channels: ["tiktok"] },
  ],
  6: [
    { time: "7:30 PM", color: "green", channels: ["tiktok"] },
    { time: "7:30 PM", color: "green", channels: ["tiktok", "instagram"] },
  ],
  7: [
    { time: "9:15 AM", color: "pink", channels: ["tiktok", "instagram"] },
    { time: "4:00 PM", color: "blue", channels: ["tiktok"] },
    { time: "7:45 PM", color: "blue", channels: ["tiktok", "instagram"] },
    { time: "7:45 PM", color: "blue", channels: ["tiktok"] },
  ],
  8: [{ time: "8:15 PM", color: "pink", channels: ["tiktok", "instagram"] }],
  10: [{ time: "11:15 PM", color: "blue", channels: ["tiktok", "instagram"] }],
  17: [{ time: "5:15 AM", color: "blue", channels: ["tiktok", "instagram"] }],
  20: [{ time: "7:15 AM", color: "pink", channels: ["tiktok"] }],
}

export function ContentCalendarView({ onGoLibrary }: { onGoLibrary: () => void }) {
  const [month, setMonth] = useState(() => DateTime.now().startOf("month").toJSDate())
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => DateTime.now().toJSDate())
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState({
    scheduled: true,
    automations: true,
    past: true,
  })
  const monthDate = DateTime.fromJSDate(month).startOf("month")
  const gridStart = monthDate.startOf("week").minus({ days: 1 })
  const calendarWeeks = Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => gridStart.plus({ days: weekIndex * 7 + dayIndex + 1 }))
  )
  const hasContent = false

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-semibold tracking-normal">Content Calendar</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Button variant="softControl" size="compact" className="text-[12px] font-semibold" onClick={() => setFilterOpen((current) => !current)}>
              <IconFilter className="size-3.5" />
              Filter
            </Button>
            {filterOpen && (
              <div className="absolute right-0 top-10 z-30 w-[170px] rounded-[7px] border border-[#e5e4dc] bg-white p-2 text-[12px] font-semibold shadow-xl">
                <CalendarFilterCheckbox
                  label="Scheduled Posts"
                  checked={filters.scheduled}
                  onChange={() => setFilters((current) => ({ ...current, scheduled: !current.scheduled }))}
                />
                <CalendarFilterCheckbox
                  label="Automations"
                  checked={filters.automations}
                  onChange={() => setFilters((current) => ({ ...current, automations: !current.automations }))}
                />
                <CalendarFilterCheckbox
                  label="Past Posts"
                  checked={filters.past}
                  onChange={() => setFilters((current) => ({ ...current, past: !current.past }))}
                />
              </div>
            )}
          </div>
          <Button variant="iconControl" size="icon-control-sm" onClick={() => setMonth(monthDate.minus({ months: 1 }).toJSDate())} aria-label="Previous month">
            <IconChevronLeft className="size-4" />
          </Button>
          <Button variant="iconControl" size="icon-control-sm" onClick={() => setMonth(monthDate.plus({ months: 1 }).toJSDate())} aria-label="Next month">
            <IconChevronRight className="size-4" />
          </Button>
          <div className="min-w-[112px] px-1 text-right text-[14px] font-semibold text-[#242421]">
            {monthDate.toFormat("LLL yyyy")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[#e5e4dc] text-[11px] font-semibold text-[#77766f]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="px-3 pb-4">
            {day}
          </div>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-b-[3px] border-x border-[#e5e4dc] bg-[#fbfbf7]">
        {calendarWeeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-[#e5e4dc] last:border-b-0">
            {week.map((day, dayIndex) => {
              const isToday = selectedDate ? day.hasSame(DateTime.fromJSDate(selectedDate), "day") : false
              const isMuted = !day.hasSame(monthDate, "month")
              const posts = hasContent && !isMuted ? scheduledPosts[day.day] ?? [] : []

              return (
                <button key={`${weekIndex}-${dayIndex}`} className="min-h-[118px] border-r border-[#e5e4dc] bg-[#fdfdf9] p-2 text-left last:border-r-0" onClick={() => setSelectedDate(day.toJSDate())}>
                  <div
                    className={cn(
                      "mb-3 flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                      isToday ? "bg-[#4e9af5] text-white" : isMuted ? "text-[#9d9c95]" : "text-[#77766f]"
                    )}
                  >
                    {day.day}
                  </div>
                  <div className="space-y-1">
                    {posts.map((post, index) => (
                      <CalendarPost key={`${post.time}-${index}`} post={post} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
        {!hasContent && (
          <div className="absolute left-1/2 top-[34%] w-[330px] -translate-x-1/2 rounded-[4px] bg-white px-7 py-5 text-center shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
            <div className="text-[13px] font-bold text-[#242421]">No content yet</div>
            <p className="mt-2 text-[12px] font-medium text-[#77766f]">Schedule posts from your library, or create an automation</p>
            <Button variant="action" size="appDefault" className="mt-4 rounded-full px-5 text-[12px] font-bold" onClick={onGoLibrary}>
              Go to library
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function CalendarFilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 hover:bg-[#f5f5f1]">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-3.5 accent-[#348fea]" />
      {label}
    </label>
  )
}

function CalendarPost({ post }: { post: { time: string; color: "pink" | "blue" | "green" | "mint"; channels: ("tiktok" | "instagram")[] } }) {
  return (
    <div
      className={cn(
        "flex h-5 items-center gap-1 overflow-hidden rounded-[2px] px-1.5 text-[10px] font-semibold text-[#4d4c47]",
        post.color === "pink" && "bg-[#f7d1ef]",
        post.color === "blue" && "bg-[#d9e8fb]",
        post.color === "green" && "bg-[#d8f5bd]",
        post.color === "mint" && "bg-[#cdf7e0]"
      )}
    >
      {post.channels.map((channel, index) => (
        <span
          key={`${channel}-${index}`}
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-black leading-none",
            channel === "tiktok" ? "bg-[#111] text-white" : "bg-gradient-to-br from-[#f8cf63] via-[#e15d8c] to-[#6d65d8] text-white"
          )}
        >
          {channel === "tiktok" ? "t" : ""}
        </span>
      ))}
      <span className="truncate">{post.time}</span>
      <span className="ml-auto text-[#31a960]">✓</span>
    </div>
  )
}

export function AnalyticsView() {
  const [range, setRange] = useState(30)
  const chartData = useMemo(() => {
    const end = DateTime.now()
    return Array.from({ length: range }, (_, index) => {
      const day = end.minus({ days: range - index - 1 })
      return {
        date: day.toFormat("M/d"),
        views: 0,
      }
    })
  }, [range])

  return (
    <div className="mx-auto max-w-[1220px]">
      <div className="mb-14 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[42px] font-bold tracking-normal">Analytics</h1>
          <p className="mt-2 max-w-[420px] text-[28px] font-medium leading-tight text-[#77766f]">
            Track your TikTok performance and engagement metrics
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="h-10 gap-2 px-3 text-[18px] font-semibold">
            <IconRefresh className="size-5" />
            Refresh
          </Button>
          <div className="flex h-12 rounded-[9px] border border-[#e1e0d8] bg-white p-1 shadow-sm">
            <button className="rounded-[7px] bg-[#f1f0eb] px-5 text-[18px] font-semibold">Table</button>
            <button className="px-5 text-[18px] font-semibold text-[#4e5868]">Grid</button>
          </div>
          <select className="h-12 rounded-[9px] border border-[#e1e0d8] bg-white px-5 text-[22px] font-semibold shadow-sm outline-none" value={range} onChange={(event) => setRange(Number(event.target.value))}>
            {[7, 30, 60, 90].map((value) => (
              <option key={value} value={value}>{value} days</option>
            ))}
          </select>
        </div>
      </div>

      <section className="rounded-[14px] border border-[#e1e0d8] bg-white p-8 shadow-sm">
        <h2 className="mb-5 flex items-center gap-3 text-[26px] font-bold">
          <IconBolt className="size-6 text-[#77766f]" />
          Daily Views (Last {range} Days)
        </h2>
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#e6e5de" strokeDasharray="4 4" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(range / 12))} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 4]} />
              <Tooltip />
              <Area type="monotone" dataKey="views" stroke="#2f7df1" fill="#2f7df1" fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-10 overflow-hidden rounded-[10px] border border-[#e1e0d8] bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1.2fr_1fr] border-b border-[#e1e0d8] bg-[#fbfbf7] text-[16px] font-bold">
          {["Account", "Views", "Likes", "Comments", "Shares", "Engagement Rate", "Created"].map((heading) => (
            <div key={heading} className="px-4 py-3">{heading}</div>
          ))}
        </div>
        <div className="grid min-h-[210px] place-items-center text-center">
          <div>
            <div className="text-[24px] font-bold">You have no TikToks publish from ReelFarm.</div>
            <p className="mt-4 text-[22px] font-medium text-[#77766f]">Once you publish a TikTok via ReelFarm, it will appear here.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
