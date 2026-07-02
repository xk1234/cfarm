# Google Ads Swipe Workflow

## Goal

Verify pages under `ads.google.com` expose the expected swipe behavior and document the current platform normalization behavior.

## Test Pages

Use both page types when available:

- A normal `https://ads.google.com/` page after sign-in
- Any `https://ads.google.com/*transparency*` path if available

## Steps

1. Open a normal `ads.google.com` page with visible campaign, ad, creative, or listing content.
2. Wait until page content is fully rendered.
3. Confirm supported card-like content receives a `✣ Swipe` button, or confirm a page-level button appears if that is the current behavior for the page.
4. Click a visible `✣ Swipe` button.
5. Confirm the button enters a saving state and then reports success.
6. Open the app Swipes view or `data/swipes/swipes.json` and confirm a new record was created.
7. If a URL containing `transparency` is available under `ads.google.com`, repeat the same button and save checks there.

## Expected Swipe Record

For normal `ads.google.com` pages, the current expected behavior is:

- `platform` or `source`: `unknown`
- `sourceUrl`: the current `ads.google.com` URL
- `caption`: visible page, campaign, ad, creative, or card text when available
- `format`: inferred from visible media, or `unknown`
- `media` or screenshot fields populated when capture succeeds

For `ads.google.com` paths containing `transparency`, the expected behavior is:

- `platform` or `source`: `google`
- `sourceUrl`: the current transparency URL
- `advertiser`, `caption`, metadata, and stats populated when visible

## Known Limitation

Normal `ads.google.com` pages are currently not normalized as `google` unless the URL path contains `transparency`. Do not fail this workflow solely because a normal Google Ads page saves as `unknown`; fail it only if the expected button is missing or the save does not create a record.

## Pass Criteria

The workflow passes when supported `ads.google.com` content can be swiped and the saved record matches the current normalization behavior above.
