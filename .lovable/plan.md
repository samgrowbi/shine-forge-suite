# Hale Advanced Aesthetics rebrand & rewiring

## 1. Sitewide brand & contact info (`src/config/brand.ts`)

- `BRAND_NAME` → `Hale Advanced Aesthetics`
- `BUSINESS_CITY` → `Las Vegas`
- Address lines → `9691 Trailwood Dr., Unit 109` / `Las Vegas, NV 89134`
- Phone display → `+1 (725) 777-1473`, tel → `+17257771473`
- Email → `haleadvancedbookings@gmail.com`
- Instagram → new URL
- Facebook → new URL
- Google Maps link + embed src → new values (extract `src` from provided iframe)
- Business hours → `Monday - Saturday 10:00 AM - 7:00 PM`, `Sunday 10:00 AM - 6:00 PM`

## 2. Logo & favicon

- Upload `Hale-Logo-removebg.png` → replace the existing `hale-logo.png.asset.json` (used by Navbar + Footer)
- Copy `Hale-Logo.jpg` → `public/favicon.jpg`, update `index.html` `<link rel="icon">` to `/favicon.jpg` type `image/jpeg`, delete `public/favicon.png`
- Remove `Navbar.tsx` `invert` class (new logo has correct colors)

## 3. Route swap: `/instant-lift` ↔ `/led`

Current routing:
```
/                  → InstantLift page
/instant-lift      → redirect to /
/led               → Index page (LED_TREATMENT)
```

Target routing:
```
/                  → Index page (LED_TREATMENT, new Face & Neck Lift config)
/led               → redirect to /
/instant-lift      → InstantLift page (current homepage)
/book/led          → BookLed  (unchanged file)
/book/instant-lift → BookInstantLift  (unchanged file)
```

- `useBookingNavigation` already routes to `/book/${treatment.slug}` — so LED treatment's slug stays `led` and Instant Lift's stays `instant-lift`, and book buttons continue to work automatically.
- No change to `BookLed.tsx` / `BookInstantLift.tsx` internals.

## 4. Treatment: `/led` (LED_TREATMENT) update

In `src/config/treatments.ts`:
- `label`: `Non-Surgical Face & Neck Lift Treatment` (already correct)
- `price`: `79.99`, `originalPrice`: `299`
- `appointmentTypeId`: `95406341`
- `calendarId`: `14289823`
- `duration`: 60

## 5. Meta Pixel

- `index.html`: `954258890721709` → `2218515452021285` (both `fbq('init')` and `<noscript>` fallback)
- `supabase/functions/acuity-webhook/index.ts`: `META_PIXEL_ID` → `2218515452021285`
- `supabase/functions/clover-webhook/index.ts`: same
- Update `mem://integrations/meta-pixel` accordingly (project memory)

## 6. Acuity timezone

- `src/config/acuity.ts`: `DEFAULT_ACUITY_TIMEZONE` → `America/Los_Angeles` stays (Vegas observes DST; GMT-7 = current PDT). This matches Acuity's Pacific setting so date offsets stay correct.
- Sofia chat prompts in `skin-specialist-chat/index.ts` — leave `America/Los_Angeles` (same zone)

## 7. Offline Purchase conversion (already implemented)

`acuity-webhook` already sends a `Purchase` event when the appointment has label `Checked In` or `Arrived` and uses `appointment.price` as `value`. Only the pixel ID needs updating. No new code.

**Webhook URL (paste into Acuity → Integrations → API → Webhooks → "Appointment Changed"):**

```
https://snggoodakniftbdgygfg.supabase.co/functions/v1/acuity-webhook
```

## 8. Date bug audit (schedule + reschedule)

The current implementation already uses `formatDateOnly` (local Y-M-D formatter, no UTC conversion) at:
- `useAcuityBooking.ts:322` when calling `acuity-times`
- `BookingCalendar.tsx:83` for isSelected comparison
- Booking submission at `acuity-book`

I will re-verify the submit and reschedule call sites to confirm no `.toISOString()` slice is used anywhere on user-selected dates (which would shift to UTC and cause the ±1 day bug), and fix any offenders in edge functions or hooks.

## 9. Review dates → recent random within last 30 days

In `src/config/treatments.ts` (BODY_SCULPTING + others) and `src/components/ClientReviews.tsx` and `src/components/thankyou/ThankYouTestimonials.tsx`, replace each hardcoded `timeAgo` (e.g. `MAY 10, 2026`) with a random date in the last 30 days from today (2026-07-07 → dates roughly 2026-06-08 through 2026-07-07). No two identical, no obvious pattern.

## 10. OG / social share image

Generate a new 1200×630 OG image for Hale Advanced Aesthetics (brand mark + tagline over a soft rose gradient). Upload to CDN via `lovable-assets`, reference the absolute URL from `og:image` / `twitter:image`. Delete old `public/og-image.jpg` (Elixir-era).

## 11. Meta titles

Already templated as `${BRAND_NAME} | ${TREATMENT.label}` in each page component. Will re-verify all pages (LedCryo, BodySculpting, InstantLift, Index) use this pattern.

## 12. Long dash removal

Sweep `src/**` for `—` (em dash) and `–` (en dash) in JSX/TSX text nodes and replace with `-`. Skip code operators (`->`).

## What I need from you before I start

Everything is answerable from your message except:

1. **`price` type change** — `TreatmentConfig.price` is currently `"79.99"` (string, decimal). You gave `$79.99` and `$299` (no decimals). I'll store `price: "79.99"`, `originalPrice: "299"` so display renders as-is. OK?
2. **Acuity webhook secret** — the webhook endpoint above is public (no auth). Acuity webhooks don't sign requests. Do you want me to add a shared-secret query-string check (e.g. `?token=…`), or leave it open like today?
3. **Timezone confirmation** — Las Vegas observes DST; `America/Los_Angeles` = GMT-7 in summer / GMT-8 in winter. Acuity typically stores calendar tz as `America/Los_Angeles`, which matches "GMT -7" today. Confirm this is your Acuity calendar's timezone (not `America/Phoenix`, which is a fixed GMT-7 no-DST zone).

Reply "go" (or answer the three) and I'll ship the whole set in one pass.
