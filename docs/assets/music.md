---
title: "Music"
description: "Reusable audio assets, uploaded sounds, selection behavior, and automation persistence."
---

## Asset library

Music is stored as `MediaLibraryAsset` records with `collection: "music"` and
`kind: "audio"`. Each record supplies an ID, display name, data-relative path,
and `/api/local-assets/**` playback URL. Paths beginning with `music/` resolve
to the Appwrite `music` Storage bucket.

`loadRealFarmData()` projects these records to `data.assets.music`, the shared
input for sound pickers in slideshow settings, video templates, and the
[Greenscreen memes](./greenscreen-memes) creator.

## Sound picker

The shared sound picker provides:

- a **Templates** tab containing the first 72 library sounds;
- play/pause preview without selecting the track;
- explicit track selection or a context-specific empty choice such as **No
  Sound** or **Random TikTok sound**; and
- an **Uploaded Sounds** tab for MP3 and WAV files.

Uploading sends the file to `/api/local-assets/upload`. The handler validates
the extension and MIME type, stores it under `music/Uploaded Sounds/`, and
upserts its media-library record. The returned asset can be selected
immediately.

## Automation and render use

Slideshow and supported video automations persist selected sound metadata with
their settings so a scheduled run can resolve the same track. A greenscreen
export stores the selected sound in its source configuration and passes its URL
to the renderer.

The absence of a selected track is contextual: the greenscreen creator renders
without a soundtrack, while slideshow publishing settings may instruct TikTok
to choose a random sound. The UI label states which behavior applies.

## Storage contract

| Concern           | Contract                                                 |
| ----------------- | -------------------------------------------------------- |
| Catalog record    | `permanent_assets` with `source_key=media_library_asset` |
| Binary bucket     | Appwrite Storage bucket `music`                          |
| Compatibility URL | `/api/local-assets/music/**` with audio range support    |
| Upload formats    | MP3 and WAV                                              |
| Uploaded path     | `music/Uploaded Sounds/<sanitized filename>`             |
