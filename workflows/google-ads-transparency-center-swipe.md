# Google Ads Transparency Center Swipe Workflow

## Goal

Verify Google Ads Transparency Center pages expose the swipe control and save normalized Google ad records.

## Test Page

Open `https://adstransparency.google.com/` and search for an advertiser that has visible ads. Use an advertiser or ad detail page with visible creative content.

## Steps

1. Wait until the advertiser or ad detail content is fully loaded.
2. Confirm one fixed bottom-center `✣ Swipe` button appears.
3. Navigate between an advertiser overview and an individual ad detail when possible.
4. Click `✣ Swipe` on the advertiser or detail page.
5. Confirm the button enters a saving state and then reports success.
6. Open the app Swipes view or `data/swipes/swipes.json` and confirm a new record was created.
7. Repeat once on a second advertiser or ad detail page.

## Expected Swipe Record

Each saved record should have:

- `platform` or `source`: `google`
- `sourceUrl`: the current Google Ads Transparency Center URL
- `advertiser`: advertiser name parsed from the page when visible
- `caption`: visible ad headline, body, or page text when available
- `format`: inferred from visible creative or transparency metadata
- `metadata.Format` when Google exposes a format label
- `stats.Last shown` or similar transparency metadata when visible
- `media` or screenshot fields populated when capture succeeds

## Pass Criteria

The workflow passes when the fixed button appears on Transparency Center pages and every click creates a Google swipe record from the current page.
