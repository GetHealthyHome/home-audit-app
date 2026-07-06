# Figma UX Review — "HomSci Pro" Home Audit App

**Source:** [Figma file `1g81MYqRogHZRFJh5LmEtx`](https://www.figma.com/design/1g81MYqRogHZRFJh5LmEtx/Untitled?m=dev)
**Reviewed:** 2026-07-06
**Compared against:** current production app (`index.html`, single-page accordion form)

---

## 1. What the Figma file contains

The file is a single page with **24 mobile screens (375 px wide)** for a rebranded app
("HomSci Pro" — the current app is titled "Healthy Home Audit Pro"). The screens fall into
five functional groups:

### A. Scheduling & job management
| Screen | Node | Notes |
|---|---|---|
| Mobile Auditor Dashboard | `2:1688` | Active pipeline count, next appointment, day schedule with Evaluation/Estimate tags and confirmation status; search prior evaluations; bottom nav with center "+" FAB |
| New Evaluation (Mobile Optimized) | `2:1766` | Customer intake: name, service address, phone, email; "Start Evaluation" + "Schedule for later" |
| Historical Assessment Search | `2:2414` | Searchable audit repository with date-grouped results ("4,120 matching evaluations") and filter sidebar |

### B. Assessment hub & site data
| Screen | Node | Notes |
|---|---|---|
| Mobile Assessment Hub | `2:1598` | Per-job checklist of test modules with status pills: Blower Door **COMPLETE**, IAQ **IN PROGRESS**, Combustion Safety **Action Required**, Site Overview **PENDING**; locked "Improvement Recommendations" card (gated until tests done) |
| Site Info & Building Science | `2:1816` | Year built, stories-above-grade segmented control, conditioned sq ft, bedrooms → **live ASHRAE 62.2 minimum-ventilation calculation** (infiltration + occupancy → target CFM) with "Calculations Validated" status |

### C. Zone-by-zone assessments (numbered sections)
| Screen | Node | Notes |
|---|---|---|
| Basement Assessment (Detailed Technical Audit) | `2:2` | Mechanical systems inventory (check what's present: water heater, boiler, furnace, air handler, dehumidifier, other) → one data-entry card per detected system (age, fuel type, efficiency rating + **required primary photo, optional detail photos**) → general basement photos |
| Crawlspace Assessment | `2:670` | "Section 02". Clearance height with **auto-upcharge rule** (below 36″ → "Restricted Space Upcharge +$150.00"), sq ft, foundation vents (present? qty), vapor barrier status (Present & Intact / Damaged / Missing), insulation condition, mandatory media capture |
| Attic Assessment | `2:2313` | Insulation type + measured depth → **auto-calculated R-value** ("R-49 — OPTIMAL"), ridge/gable vent checkboxes, airflow insight callout, photos, Save Draft |
| Garage Assessment | `2:1015` | "Section 07". Attached/Detached toggle, critical safety checks (fire-rated door, R-30 above-garage bedroom), clinical observations notes, dark-themed media capture card, environmental data (floor temp w/ "DEW POINT RISK", slab moisture %) |
| Exterior Assessment | `2:810` | Site logistics: vehicle accessibility (Truck / Box Truck), parking instructions, **required parking photo** ("Photo Required" badge) + repeated exterior sections |
| Living Floor 1 / 2 / 3 | `2:1234` / `2:1412` / `2:1518` | Per-floor **Window Audit** (per-room window type, glazing, condition Good/Fair/Poor, "+ Add Window") and per-floor room photo grid ("2/12 Photos Captured") with Thermal Scan action |

### D. Diagnostic tests
| Screen | Node | Notes |
|---|---|---|
| Blower Door & Safety | `2:322` | **Mandatory setup checklist gates the measurement UI** (windows closed, dampers closed, combustion appliances off, interior doors open, basement/attic access) → ring selection (Open/A/B/C), CFM50 entry, required photos (overall setup, manometer reading), Submit locked until complete |
| CAZ Safety Multi-Photo Capture | `2:442` | "0/4 Critical Tests" counter, **Compliance Lock** ("Submission restricted until all safety hard-stops recorded"), per-test Pass/Fail + Capture (venting, gas leak, undiluted CO, ambient CO/spillage), per-appliance photo capture with unit quantity ("multiple units detected") |
| IAQ Test Timer | `2:1188` | 30:00 countdown, "Test in Progress" pill, "How to Run Test" help link, note that test runs in background |
| IAQ Test Results Entry | `2:1112` | "Test Complete" state; CO₂ (412 ppm — "Optimal"), VOC (0.2 mg/m³ — "Excellent") result cards with threshold labels; Save & Continue vs "Retest (Discard Data)" |

### E. Media, recommendations & proposal
| Screen | Node | Notes |
|---|---|---|
| Appliance Media Gallery | `2:1918` | Photos grouped by system (Furnaces, Water Heaters, Outdoor Units) with unit counters, per-photo metadata (date, inspector), photo IDs (#F-8291), batch export, bulk edit/tag/verify toolbar |
| Simplified Media Tagging | `2:3180` | Required vs supporting photo tags, completion meter, "2 required tags missing" blocking state, category filter drawer (All / Attic / Basement / Appliances / IR Thermal) |
| Proposal Media Selection | `2:2800` | Select photos for the customer proposal ("12 items ready — estimated 8 pages"), import external IR data, review selection |
| Improvement Catalog | `2:2665` | Curated retrofit library grouped Attic & Insulation / HVAC / Basement & Foundation; each card: description, Est. ROI %, impact badge (High Impact / Critical / Elite), "+" add-to-plan; "Review Selections (3)" |
| Recommendation Builder | `2:3095` | Per-measure spec: estimated cost, annual savings, contractor notes/scope, avg ROI %, payback period, **"Science Context"** homeowner-education block with benefit summary and photo figure captions |
| Proposed Solution Summary | `2:2972` | Total investment ($14,850), annual savings ($2,140/yr), simple payback (6.9 yrs vs 9 yr market avg), line-item breakdown with rebate eligibility, cumulative ROI bar chart, "Generate Proposal PDF" |
| Assessment Summary (Appliance Photos) | `2:2132` | Read-only audit record: overview stats, customer profile, HVAC details, appliance inventory w/ photo chips, water heating, fenestration, assessment media wall; "Edit Mode" toggle + floating edit FAB |

The proposal-flow screens (group E) are duplicated twice in the file (rows 2 and 3 are identical copies).

---

## 2. Design language

- **Brand:** "HomSci Pro", tagline "Clinical Precision". Deliberate clinical/scientific tone
  throughout ("clinical record", "Clinical Insight", "Science Context", customer shown as
  "Dr. Julian Voss").
- **Color:** deep forest green primary (buttons, headlines, metrics), pale sage/off-white
  background, white cards with large radii, **magenta/purple as the "attention" accent**
  (upcharges, multiple-units-detected, calculated ratings), red reserved for hard failures,
  light blue for informational status.
- **Type:** large serif-weight display headlines for screen titles; big numeric callouts for
  measurements (30:00, 412 ppm, R-49, $14,850); small uppercase field labels.
- **Components:** status pills (COMPLETE / IN PROGRESS / Action Required / PENDING /
  OPTIMAL), segmented controls (stories, ring selection, Pass/Fail), stepper/qty inputs,
  photo-capture tiles (required = outlined green with badge; optional = gray), insight/callout
  bars with left accent border, bottom tab bar + green center FAB, drawer-style category
  filter.
- **Recurring UX patterns worth preserving in implementation:**
  1. **Gating / hard-stops** — measurement inputs disabled until setup checklist done;
     submission locked until safety tests recorded; recommendations locked until tests
     complete. Safety compliance is a first-class concept.
  2. **Required vs optional photo evidence** everywhere, tied to specific subjects (per
     appliance unit, manometer, parking area), with per-unit quantity awareness.
  3. **Live derived values** — ASHRAE 62.2 target CFM, R-value from depth+type, upcharge
     from clearance height, ROI/payback from cost+savings. The app does building-science
     math for the auditor, not just data collection.
  4. **Status-driven navigation** — the hub is a checklist of modules, each independently
     resumable; matches real audit workflow (tests run in parallel, e.g. 30-min IAQ timer
     runs in background while auditor does zone work).
  5. **Audit → evidence → recommendation → proposal** pipeline ending in a customer-facing
     PDF with financials.

---

## 3. Gap vs. the current app

The current app is one HTML file: five accordions of raw inputs, a house-fill progress icon,
and a fire-and-forget POST to a Google Apps Script endpoint. The Figma is a full product.
Biggest conceptual deltas:

| Area | Current app | Figma design |
|---|---|---|
| Structure | 1 screen, 5 accordions | ~20 screens, hub-and-spoke modules |
| Jobs | none (one audit at a time) | pipeline, schedule, customer records, history search |
| Photos | none | core primitive: required evidence, galleries, tagging, proposal selection |
| Safety | 2 fields (CO, CAZ pass/fail) | dedicated CAZ workflow with hard-stops and compliance lock |
| Calculations | none | ASHRAE 62.2, R-value, upcharges, ROI/payback |
| Output | row in a spreadsheet | recommendation builder + customer proposal PDF |
| Offline | localStorage fallback | not addressed in designs (must carry over — field use) |

---

## 4. Issues to resolve in the designs (before/while building)

**Blocking inconsistencies**

1. **Bottom navigation is different on almost every screen** — at least 7 distinct tab sets
   (Dashboard/Reports/+/Archive/Settings; Dashbo/Site/Tests/Repo; Dashboard/Site Info/Blower
   Door/Rooms; Assess/Reports/History/Settings; Moni/History/Sensors/Profile;
   Audit/Reports/Devices/Profile; Audit/Catalog/Builder/Summary). These are probably
   *flow-local* steppers drawn as global nav. Decide: one global tab bar (Dashboard /
   Assessment / Media / Reports / Settings) + in-flow segmented steppers for
   Audit→Catalog→Builder→Summary and Site Info→Blower Door→Rooms.
2. **Brand string is inconsistent/truncated** — "HomSci Pro", "HomeSci Pro", "HomSci Prc",
   "HomSci" appear; many headers clip the logo text. Pick one name and fix header layout.
3. **Historical Assessment Search is a desktop layout** (256 px fixed sidebar + main column)
   squeezed into a 375 px frame — unusable as drawn; needs a mobile pattern (filter sheet or
   chips above results).
4. **Several primary CTAs are invisible/near-invisible** (white text on white/near-white):
   "Start Evaluation" (New Evaluation), "Save & Continue Assessment" (IAQ results),
   "Finalize Assessment" (Crawlspace/Attic), "Generate Proposal PDF" (Summary). If these are
   meant to be disabled states, the design needs an explicit disabled treatment; as drawn
   the main action of each screen can't be seen.
5. **Unresolved template tokens** — Simplified Media Tagging cards show literal
   `{{photo…}}` placeholder strings.

**Polish / consistency**

6. Widespread text overflow: overlapping title/subtitle blocks (Site Info, Proposed Solution,
   dashboard schedule cards), clipped labels ("ROVEMENT RECOMMENDATIONS", "Review Selec…",
   truncated nav labels "Dashbo", "Moni", "Repo"). Auto-layout constraints need a pass.
7. Duplicate screen copies (rows 2–3) should be pruned or converted to named variants so the
   file has one source of truth per screen.
8. Contrast concerns for outdoor tablet use: light-gray small labels on white, green-on-sage;
   recommend bumping label contrast and testing in sunlight conditions.
9. Mixed persona language ("clinical record" for a homeowner-facing proposal) — fine as
   internal brand voice, but customer-facing artifacts (proposal PDF) should use homeowner
   language.

**Design/product questions the file doesn't answer**

- Offline behavior and sync (field houses often lack signal — current app at least saved to
  localStorage). Photo capture especially needs an offline queue.
- Where data lives (current Google Apps Script endpoint won't support photos, history
  search, or proposals).
- IAQ timer: what happens on app kill / navigation away (design says "runs in background").
- Who consumes the proposal PDF and how it's delivered (email? Docusign? print?).

---

## 5. Suggested build order

1. **Foundation** — multi-screen shell (hub + global nav), local-first storage/sync model,
   photo capture primitive with required/optional evidence slots.
2. **Assessment core** — Site Info (with 62.2 calc), zone assessments (basement, attic,
   crawlspace, garage, exterior, living floors), window audit.
3. **Tests & safety** — blower door with setup gating, CAZ hard-stop workflow, IAQ timer +
   results.
4. **Media layer** — galleries, tagging, batch operations.
5. **Sales layer** — improvement catalog, recommendation builder, proposal summary + PDF.
6. **Job management** — dashboard/schedule, customer records, history search.

Each phase is shippable on its own; phases 1–3 replace everything the current form does
while matching the auditor's real workflow.
