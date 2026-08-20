export type SlideshowSettings = {
  duration: number
  // A slideshow uses one aspect ratio and font throughout; mixed values would
  // be cropped inconsistently by social carousel renderers.
  aspect_ratio: string
  font: string
  background_color: string
  transition_style: string
  export_as_video: boolean
  sound_id: string
  sound_name: string
  sound_url: string
}
