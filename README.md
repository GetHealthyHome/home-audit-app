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
  projection, printable proposal) with proposal media selection
- **Media review**, **Audit history**, read-only **Assessment Record** with
  cloud sync (legacy Google Apps Script endpoint)

## Architecture

Plain HTML/CSS/JS, no build step (classic scripts so `file://` works):

```
index.html          shell
css/app.css         design system (tokens from the Figma file)
js/icons.js         inline SVG icon set (offline-safe)
js/data.js          domain data: zones, protocols, improvement catalog
js/store.js         state (localStorage) + photos (IndexedDB) + derived calcs
js/ui.js            shared render helpers
js/screens-*.js     screen render functions
js/app.js           hash router + delegated event handling
```

State is offline-first: audit data persists in `localStorage`, photos are
downscaled and stored in IndexedDB, and a "Finalize & Sync" action posts the
audit record to the HomSci cloud endpoint when a connection is available.
