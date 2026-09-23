# Landing page updates

## Changes
- Replace the six facial result cards in their current order using the supplied composite photos, split into matching before and after sources so the existing card interaction, sizing, labels, names, and carousel remain unchanged.
- Remove the Sofia chat mount and its frontend-only files and assets, while leaving booking forms and tracking untouched.
- Remove the Google Maps, Yelp, and Trustpilot logo row and its unused imports/assets without changing the review content itself.
- Compact the "Who Is This For?" section only below 768px, keeping desktop styles unchanged.
- Compact the five treatment stat cards on all sizes, retaining one desktop row and using a compact two-column mobile grid with the fifth card centered across the row.

## Verification
- Check 1440px desktop, 768px tablet, and 375px mobile for spacing, overflow, overlaps, missing images, and console errors.
- Confirm the six result images load lazily with descriptive before/after text.
- Confirm no Sofia UI or review-platform badges remain.
- Confirm the Meta Pixel PageView request still fires on initial page load.
