import { Button } from "@/components/ui/button"
import type { AutomationDay, AutomationSchedule, AutomationSchema } from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

import {
  automationDays,
  defaultPostingTime,
  displayTimeFromInput,
  scheduleFrequencyLabel,
  schedulePostingTimes,
  timeInputValue,
  timezoneLabel,
} from "./schedule-helpers"
import { SettingsFooter, SettingsPage } from "./settings-layout"

export function SchedulePanel({
  config,
  onConfigChange,
  onCancel,
  onSave,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <PostingSchedulePanel
      schedule={config.schedule}
      onScheduleChange={(schedule) => onConfigChange({ ...config, schedule })}
      onCancel={onCancel}
      onSave={onSave}
    />
  )
}

export function PostingSchedulePanel({
  schedule,
  onScheduleChange,
  onCancel,
  onSave,
}: {
  schedule: AutomationSchedule
  onScheduleChange: (schedule: AutomationSchedule) => void
  onCancel: () => void
  onSave: () => void
}) {
  const postingTimes = schedulePostingTimes({ schedule } as AutomationSchema)
  const weeklyPostCount = postingTimes.reduce(
    (total, postingTime) => total + postingTime.days.length,
    0
  )

  function updatePostingTimes(
    nextPostingTimes: AutomationSchema["schedule"]["posting_times"]
  ) {
    onScheduleChange({
      ...schedule,
      posting_times: nextPostingTimes.slice(0, 5),
    })
  }

  function updateTime(index: number, time: string) {
    updatePostingTimes(
      postingTimes.map((postingTime, postingIndex) =>
        postingIndex === index ? { ...postingTime, time } : postingTime
      )
    )
  }

  function toggleDay(index: number, day: AutomationDay) {
    updatePostingTimes(
      postingTimes.map((postingTime, postingIndex) => {
        if (postingIndex !== index) {
          return postingTime
        }
        const hasDay = postingTime.days.includes(day)
        const days = hasDay
          ? postingTime.days.filter((item) => item !== day)
          : [...postingTime.days, day].sort(
              (first, second) =>
                automationDays.indexOf(first) - automationDays.indexOf(second)
            )

        return {
          ...postingTime,
          days: days.length > 0 ? days : [day],
        }
      })
    )
  }

  function addPostingTime() {
    if (postingTimes.length >= 5) {
      return
    }
    updatePostingTimes([...postingTimes, defaultPostingTime()])
  }

  function removePostingTime(index: number) {
    updatePostingTimes(
      postingTimes.filter((_, postingIndex) => postingIndex !== index)
    )
  }

  return (
    <SettingsPage
      title="Posting times"
      action={
        <span className="rounded-full bg-[#333] px-4 py-2 text-[14px] font-semibold text-white">
          {timezoneLabel(schedule.timezone)}
        </span>
      }
    >
      <div className="flex items-center justify-between border-b border-[#ecebe4] py-4">
        <div className="text-[16px] font-semibold text-[#333]">
          {scheduleFrequencyLabel(postingTimes)}
        </div>
        <div className="text-[16px] font-semibold text-[#333]">
          {weeklyPostCount}/week
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {postingTimes.map((postingTime, index) => (
          <div
            key={`${postingTime.time}-${index}`}
            className="grid items-center gap-3 md:grid-cols-[132px_1fr_58px]"
          >
            <input
              className="h-12 rounded-[8px] border border-[#d8d7cf] bg-white px-3 text-[17px] font-semibold text-[#111] outline-none focus:border-[#9f9e96]"
              type="time"
              value={timeInputValue(postingTime.time)}
              onChange={(event) =>
                updateTime(index, displayTimeFromInput(event.target.value))
              }
              aria-label={`Posting time ${index + 1}`}
            />
            <div className="flex flex-wrap gap-2">
              {automationDays.map((day) => (
                <button
                  key={day}
                  className={cn(
                    "h-11 min-w-11 rounded-[8px] border px-3 text-[15px] font-semibold shadow-sm transition",
                    postingTime.days.includes(day)
                      ? "border-[#4d4c47] bg-white text-[#111]"
                      : "border-[#deddd5] bg-[#f7f7f3] text-[#9a9991]"
                  )}
                  onClick={() => toggleDay(index, day)}
                  aria-pressed={postingTime.days.includes(day)}
                >
                  {day.slice(0, 2)}
                </button>
              ))}
            </div>
            {index > 0 ? (
              <button
                className="grid h-12 w-12 place-items-center rounded-[8px] bg-[#fff1f1] text-[20px] font-bold text-[#e34b55]"
                onClick={() => removePostingTime(index)}
                aria-label={`Remove posting time ${index + 1}`}
              >
                -
              </button>
            ) : (
              <span className="hidden md:block" />
            )}
          </div>
        ))}
      </div>
      <Button
        variant="softControl"
        size="appDefault"
        className="mt-6 w-full justify-center"
        onClick={addPostingTime}
        disabled={postingTimes.length >= 5}
      >
        Add posting time
      </Button>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

