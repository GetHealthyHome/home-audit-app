# HomSci Pro — Home Audit App

Field app for residential energy / healthy-home audits, implementing the
[HomSci Pro Figma designs](https://www.figma.com/design/1g81MYqRogHZRFJh5LmEtx/Untitled?m=dev)
(see `docs/FIGMA_UX_REVIEW.md` for the full design review).

## Running it

It's a dependency-free static app — open `index.html` in a browser, or serve
the folder with any static host. Works offline; designed for a phone/tablet
in the field.

## What's in it

- **Dashboard** — schedule, active pipeline, customer search
- **New Evaluation** — customer intake, start now or schedule for later
- **Assessment Hub** — per-job checklist of modules with live status pills
- **Site Info** — structural parameters with a live ASHRAE 62.2
  minimum-ventilation calculation
- **Zone assessments** — Crawlspace (clearance upcharge rule), Basement
  (mechanical systems inventory with required unit photos), Attic (auto
  R-value rating), Garage (fire-safety checks, environmental data), Exterior
  (site logistics), Living Floors 1–3 (window audit + room photos)
- **Diagnostics** — Blower Door (setup checklist gates the measurement),
  Combustion Safety (4 hard-stops with compliance lock), IAQ (30-minute
  background timer + results entry with rating bands)
- **Sales pipeline** — Improvement Catalog → Recommendation Builder (financial
  estimates + science context) → Proposed Solution Summary (payback, ROI
  projection) → **customer-facing Proposal document** (cover, investment
  table, per-measure explanations, site evidence gallery, signature page)
  with print-optimized PDF layout
- **Calendar view** on the dashboard (month grid with appointment dots)
- **Media review & tagging** (required-tag tracking), **audit history**,
  read-only **Assessment Record**, per-audit **JSON export**
- **Cloud sync** to Supabase — offline-first with resumable photo upload and
  automatic retry on reconnect
- **Energy Model (optional)** — external climate API + measured audit data →
  modeled annual energy costs (see below)

## Architecture

Plain HTML/CSS/JS, no build step (classic scripts so `file://` works):

```
index.html          shell
css/app.css         design system (tokens from the Figma file) + print layout
js/icons.js         inline SVG icon set (offline-safe)
js/data.js          domain data: zones, protocols, improvement catalog
js/config.js        backend configuration (Supabase URL + publishable key)
js/store.js         state (localStorage) + photos (IndexedDB) + derived calcs
js/backend.js       Supabase REST/Storage sync (plain fetch, no SDK)
js/ui.js            shared render helpers
js/screens-*.js     screen render functions
js/app.js           hash router + delegated event handling
```

## Backend (Supabase)

Data lives on the device first (`localStorage` + IndexedDB). "Finalize & Sync"
— or Settings → *Sync now* — pushes each audit to Supabase:

- `public.audits` — one row per audit (customer, status, full JSON payload)
- `public.audit_photos` — one row per photo, with the storage path
- `audit-photos` storage bucket — downscaled JPEG evidence, public-read so
  proposals and other devices can render images without signed URLs

Photo uploads are resumable (progress is tracked per photo), and pending
audits retry automatically when the device comes back online. Settings also
offers *Pull audits from the cloud* to fetch records captured on other
devices.

The schema lives in the Supabase migration `homsci_audit_sync`. The app uses
the publishable anon key (safe to embed); RLS policies currently allow
anonymous read/insert/update on the two audit tables because field devices
are unauthenticated — add crew logins and tighten the policies to
`authenticated` when accounts land.

## Energy Model (optional, external API)

An opt-in module on the Assessment Hub — not required for any audit, run it
when a customer wants modeled numbers:

1. Geocodes the home's town via the **Open-Meteo geocoding API** (keyless,
   CORS-enabled) and pulls the last 12 months of daily mean temperatures from
   the **Open-Meteo archive API**.
2. Computes heating/cooling degree days (base 65 °F) from real local weather.
3. Combines climate with *measured* audit data — blower-door CFM50 (infiltration
   via the N-factor method), calculated attic R-value, square footage, and the
   window audit — into a UA heat-loss breakdown and modeled annual heating +
   cooling costs.
4. Assumptions (fuel price, electric price, system efficiency, SEER) are
   editable and recompute instantly; climate data is cached on the audit so no
   refetch is needed and results survive offline.

Model output flows into the Proposed Solution Summary ("improvements target
≈ N% of modeled spend") and the customer proposal document ("using a full
year of local weather data…"). If the API is unreachable in the field the
module fails gracefully and previously fetched climate data is kept.
`js/energy.js` isolates the provider — swapping in NREL/DOE endpoints (e.g.
Home Energy Score) later only touches that file.
