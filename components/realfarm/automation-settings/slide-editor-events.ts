const textEditorSelector = "[data-slideshow-text-editor]"

export function clickTargetsSlideshowTextEditor(target: EventTarget | null) {
  const closest = (
    target as EventTarget & {
      closest?: (selector: string) => Element | null
    }
  )?.closest

  return (
    typeof closest === "function" &&
    Boolean(closest.call(target, textEditorSelector))
  )
}
