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
- **Proposal generator** — the proposal is rendered from an **editable HTML
  template** (Settings → Edit Proposal Template, or `#/template`): a
  mustache-style engine (`js/proposal.js`) substitutes `{{tokens}}` with live
  assessment data, photos and financials, with `{{#if}}`/`{{#each}}` sections.
  The template editor has **two switchable views** — a **Visual view**
  (default) that renders the template live against the open evaluation (or
  built-in sample data when none is open), and a **Code view** with the raw
  HTML and the token reference; unsaved code edits show in the visual
  preview immediately. On the proposal screen the assessor
  **checks/unchecks which recommended improvements** appear in the document
  without touching the working plan. Custom templates persist locally; one
  tap restores the default design.
- **Diagnostics how-to guides** — every diagnostics section (Blower Door,
  IAQ, Combustion Safety, Site) carries a tappable **? icon** (on the hub
  row and in the test screen's header) that opens a **step-by-step field
  procedure**: numbered instructions with optional reference photos, plus an
  optional attached **PDF** (manufacturer manual / company SOP) that opens
  from the guide. Guides ship with authored defaults and are fully
  **admin-editable** (Admin Portal → Diagnostics Guides): rewrite steps, add
  or remove them, and upload step photos or the PDF straight to cloud
  storage from the editor.
- **Shareable proposal deck** (`deck.html?t=<share-token>`) — a customer-facing,
  full-screen slide presentation (keyboard/swipe/dot navigation, Export PDF
  with one landscape page per slide) auto-populated from the synced audit:
  cover with totals, one slide per selected site photo, one per recommended
  improvement (base cost + pricing-rule adjustments itemized), investment
  summary, next steps. Served by the public `proposal-deck` edge function via
  an unguessable per-audit `share_token` (capability URL — no customer login);
  only a whitelisted, customer-facing subset of the payload leaves the server.
  Sync embeds a `proposalComputed` snapshot so the deck prices correctly
  without the device-local admin config. Auditors tap **Share Online Deck**
  on the proposal screen to copy the link. The slide layouts are plain
  template functions in `js/deck.js` (+ `css/deck.css`) — edit them in the
  GitHub web editor and Vercel redeploys the live deck on commit.
- **Admin Portal** (`#/admin`, from Settings) — company configuration that
  overlays the shipped defaults: manage the **improvement catalog** (add /
  edit / delete measures: science copy, benefits, cost build-up), maintain a
  **materials catalog** (unit costs per sqft / per piece / flat, each reading
  its quantity from an assessment value — attic area, home sqft, crawlspace
  area, window/vent counts). A measure's **base cost is computed per audit**
  as the sum of its attached materials' quantity x unit cost (a flat cost is
  used when no materials are attached, and missing quantities are flagged
  instead of silently pricing $0); define **pricing rules** that further
  adjust a measure's cost from audit answers (flat $, $ per sqft, or % of
  base — conditioned on any audit field; shown together with the material
  build-up in the Builder, overridable per audit), and
  edit **audit prompts** (motivations, heat types, blower-door checklist
  items, CAZ hard-stop wording) and the **diagnostics guides**. Each measure also carries **suggest-when
  conditions** on assessment data (sqft, dropdown selections, test
  readings); matching measures surface under "Suggested from this
  assessment" in the Catalog with the triggering reason, and the hub shows
  the count. Config lives in local state and can be **exported/imported as
  JSON** to keep crew devices in sync. On desktop, signed-in admins get an
  **Admin entry in the left navigation rail**.
- **Calendar view** on the dashboard (month grid with appointment dots)
- **Media review & tagging** (required-tag tracking), **audit history**,
  read-only **Assessment Record**, per-audit **JSON export**
- **Photo stamping & tags** (Admin Portal → Media Settings) — an admin
  toggle burns the **capture date/time and GPS longitude/latitude into the
  lower-right corner** of every new photo (falls back to date/time-only
  when location is unavailable; coordinates are also stored on the photo
  record). A customizable **media tag list** (one per line) is offered in
  a bottom sheet **right after taking a picture in any section** and again
  in Media Review. Every **required photo slot carries a unique ID**
  (e.g. `BLOWER-SETUP`, `ATTIC-MEDIA-1`) shown on the slot, on media
  tiles, and in the proposal's figure captions — tracing each proposal
  figure back to where it was captured in the assessment.
- **Cloud sync** to Supabase — offline-first with resumable photo upload and
  automatic retry on reconnect. **Crew roles**: every account is an `admin`
  or `auditor` (public.profiles, created by trigger on signup). Admin-only
  surfaces (Admin Portal, proposal template editor) are gated on the role;
  admins manage crew from Admin Portal → Crew Accounts (create sign-ins,
  assign roles, reset passwords, remove accounts) via the `crew-admin` edge
  function, which verifies the caller's admin role server-side before using
  the service key. Signed-in crew can change their own password in Settings.
  Without a configured backend the app is single-device and admin features
  stay open.
- **Desktop layout** — on screens ≥940px the bottom tab bar becomes a left
  navigation rail, the content column widens and centers, and photo/media
  grids use the extra room (pure CSS; same markup serves phone and desktop).
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

The schema lives in the Supabase migrations `homsci_audit_sync` and
`homsci_auth_tighten_rls`. The app uses the publishable anon key (safe to
embed) for project routing only — data access requires a signed-in crew
member (see below).

## Crew authentication

Sign-in is Supabase Auth (email + password) over plain fetch (`js/auth.js`):
login, signup (with name), token refresh, and logout. The app stays fully
usable **offline without an account** — signing in is what unlocks cloud sync
and job import. Sessions persist in local state and refresh automatically;
the auditor profile (name, avatar initials) follows the signed-in user.

RLS is **authenticated-only**: all read/insert/update policies on
`public.audits`, `public.audit_photos`, and the storage bucket require the
`authenticated` role. Photo reads remain via unguessable public object URLs
(capability URLs) so `<img>` tags and proposals render without signed URLs;
bucket listing and all writes require sign-in. All signed-in crew share the
company audit repository by design (`created_by` records provenance for
future per-crew rules).

Provision crew accounts from the Supabase dashboard (Auth → Users) or let
crew self-register via the app's Create Account form — enable/disable email
confirmation under Auth → Providers to control that flow.

## Housecall Pro job import

The dashboard (truck icon) and Settings can import upcoming Housecall Pro
jobs into the schedule. The company API key is **never on the device**: the
`hcp-jobs` Supabase Edge Function proxies `api.housecallpro.com` and returns
a slim job list (customer, address, scheduled start, work status) to
signed-in crew (JWT verified). Imported jobs appear as scheduled evaluations
with an `HCP` chip, dedupe on the Housecall Pro job id, and refresh schedule
details on re-import while untouched.

To connect: create an API key in Housecall Pro (Settings → API) and set it
as a function secret — `supabase secrets set HCP_API_KEY=<key>` (or
Dashboard → Edge Functions → hcp-jobs → Secrets). Until the secret exists
the function reports "not configured" and the app explains what to do.

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
