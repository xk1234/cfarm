# TikTok Seller SG Swipe Workflow

## Goal

Verify TikTok Seller SG pages expose the extension swipe control and can save a normalized seller-platform swipe.

## Test Page

Open `https://seller-sg.tiktok.com/` and sign in if required. Use a page with visible product, campaign, creative, or listing content when available.

## Steps

1. Wait until the Seller SG page is fully loaded.
2. Confirm the fixed `✣ Swipe` button appears on the page.
3. If the page contains product, creative, campaign, or listing cards, confirm those cards also receive swipe controls where supported.
4. Click the fixed `✣ Swipe` button.
5. Click one card-level `✣ Swipe` button if card-level buttons are present.
6. Confirm each clicked button enters a saving state and then reports success.
7. Open the app Swipes view or `data/swipes/swipes.json` and confirm one new record per successful click.

## Expected Swipe Record

Each saved record should have:

- `platform` or `source`: `tiktok-seller`
- `sourceUrl`: the current Seller SG page URL, or an item URL when a card-level URL exists
- `advertiser`: seller, shop, brand, or account name when visible
- `caption`: visible product, creative, campaign, or page text
- `format`: inferred from available media, such as `image`, `video`, or `unknown`
- `media` or screenshot fields populated when capture succeeds

## Pass Criteria

The workflow passes when the fixed button saves the current Seller SG page and any supported visible card-level buttons save item-specific records.

## Failure Notes

Authentication redirects are not extension failures. Start the workflow after a page with real Seller SG content is visible.
