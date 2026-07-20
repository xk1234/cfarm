---
title: "Create, review, update, and delete a collection [User]"
description: "Build a captioned Pinterest image collection for an ocean-app campaign, inspect it, rename it, add more assets, and remove it safely."
---

## Outcome

You create a curated image collection for promoting an ocean-conservation app,
review the imported media, rename the collection for campaign use, and understand
the current delete behavior.

For contracts and non-image types, see the canonical
[Collections overview](../collections/overview.md) and
[CRUD/lifecycle matrix](../collections/crud.md).

This workflow was verified in the app with the Pinterest query:

`ocean conservation app blue underwater photography vertical`

## Current CRUD support

| Action | Current app behavior                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| Create | Import selected Pinterest or Pexels results, or start empty. The detail drop zone is not yet durable. |
| Read   | Search, sort, open, pin, and inspect image counts and individual assets.                              |
| Update | Rename the collection, add more remote or uploaded images, and request captions.                      |
| Delete | Shows media/dependency impact, soft deletes for 30 days, and offers undo.                             |

## 1. Start a Pinterest import

1. Open **Collections** and keep **Images** selected.
2. Click **Add**.
3. Keep the source set to **Pinterest**.
4. Leave **Auto-caption** enabled so imported media receives searchable visual
   descriptions.

![Pinterest collection search opened from the Images collection library](/docs/workflows/collection-crud-01-pinterest-search.jpg)

## 2. Search for ocean-app campaign visuals

1. Search for `ocean conservation app blue underwater photography vertical`.
2. Review the returned images as a campaign art director, not as a bulk
   downloader.
3. Prefer vertical underwater photography, clear blue palettes, marine life,
   light rays, and open water that can hold text overlays.
4. Exclude screenshots, watermarked promos, unrelated products, and images with
   baked-in advertising copy.

![Pinterest results for the ocean-app promotion query](/docs/workflows/collection-crud-02-pinterest-results.jpg)

## 3. Curate and import the collection

1. Select a visually consistent subset rather than using **Select All**.
2. Confirm **Auto-caption** is still enabled.
3. Click **Add 7 images**.
4. Wait for the **Image captions ready** notification before using the
   collection in an automation.

![Seven ocean campaign images selected with automatic captioning enabled](/docs/workflows/collection-crud-03-selected-images.jpg)

The imported collection initially inherits the Pinterest query as its name and
appears at the top of the collection library.

![New Pinterest ocean collection in the image collection library](/docs/workflows/collection-crud-04-created.jpg)

## 4. Read and inspect the collection

1. Open the collection card.
2. Check the image count and scan every thumbnail for off-theme or low-quality
   media.
3. Use **View** for a larger inspection pass.
4. Use **Get image captions** if captions are missing or need to be regenerated.
5. Use the selection controls when removing individual images from the set.

![Ocean collection detail with seven imported images and collection actions](/docs/workflows/collection-crud-05-detail.jpg)

## 5. Update the collection

1. Click **Edit** beside the collection name.
2. Rename it to **Ocean App – Blue Conservation Campaign**.
3. Click **Save**.
4. Use **Add** to run another Pinterest or Pexels search. The visible local-file
   drop zone currently saves browser `blob:` URLs and does not survive reloads,
   so do not use it for durable collection media yet.
5. Re-run captions after adding uncaptioned media.

![Renaming the imported Pinterest collection for the ocean campaign](/docs/workflows/collection-crud-06-rename.jpg)

![Updated Ocean App collection with its campaign-ready name](/docs/workflows/collection-crud-07-updated.jpg)

## 6. Delete a collection

1. Return to the collection library.
2. Select the trash action and review the collection name, total media count,
   and every automation or template that references it.
3. Confirm **Delete**. The card disappears, but its record and media remain
   recoverable for 30 days.
4. Select **Undo** in the success toast to restore it immediately when needed.

![Collection library after the temporary ocean campaign collection was deleted](/docs/workflows/collection-crud-08-deleted.jpg)

## Success check

- The imported images share a clear underwater campaign direction.
- Auto-generated captions are available before automation use.
- The collection name communicates its campaign purpose.
- Off-theme and low-quality images were excluded manually.
- Deletion shows automation/template dependencies and remains recoverable.
