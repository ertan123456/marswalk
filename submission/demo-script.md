# MARSWALK — 30-second demo script

**Live:** https://ertan123456.github.io/marswalk/ · **Repository:** https://github.com/ertan123456/marswalk

Voiceover with the exact on-screen action for each beat. Total 30 s at a steady reading pace
(~85 words). Timings are cumulative.

**Note on the guided mode:** the automated "Guided demo" button is *not built yet* — it is listed in
the README under future work. Today a presenter drives these beats by hand, and they are written so
that is easy. The beat table doubles as the spec for the automated version.

---

## The script

| t | Voiceover | On screen |
|---|---|---|
| **0:00** | "This is lower Mount Sharp — the ground Curiosity has actually driven." | PLAN mode, already loaded. Basemap + hazards + the yellow rover track visible. |
| **0:04** | "Real HiRISE elevation, real rover path, every layer tagged for where it came from." | Click once on the map, mid-AOI. Readout opens: seven layers answer, each with REAL / DERIVED / MODELED. |
| **0:10** | "Three stations, on foot: eight kilometres, four fifty-one, thirty per cent of consumables left. Go." | Pan right to the EVA TRAVERSE panel. GO banner and the four readouts. |
| **0:15** | "Add the upper stations and it fails — and it tells you exactly why." | Click `+` on GV-04, GV-05, BX-06. Panel flips to NO-GO with the violation list. |
| **0:20** | "Walk-back: at every step the crew must still reach safety with their reserve. Here they can't." | Point at the red stretch on the route and the crossing lines on the walk-back chart. |
| **0:24** | "Bring the rover: it's barred from steeper ground than the crew, so it drops them here —" | Toggle **Rover-assisted**. DROP marker appears; route thickens into driven/dashed-walked. |
| **0:28** | "— and the same science costs half the consumables." | Readouts settle: 62% consumables left. Hold. |

---

## Delivery notes

- **Do not read the numbers off the slide — read them off the screen.** They are computed live, and
  if a station is toggled differently they will differ. The beats above assume the default plan
  (three stations, on foot) as the app loads.
- The pause at 0:20 is the one that matters. Everything before it is a map; that beat is the
  product.
- If the 30 seconds has to become 20, cut beats 0:04 and 0:20 and let the GO→NO-GO→rover arc carry
  it. If it can stretch to 45, add: 3D mode, fly-through, then HUD — "and the crew sees the same
  plan from inside the helmet."

## Fallbacks

- **The map does not load:** switch to the DATA tab. It is generated from the live layer registry
  and needs no terrain, so it always renders — and it is the strongest provenance story anyway.
- **The 3D view is slow on the demo machine:** skip it. Nothing in the 30-second cut needs it.
- **Asked "is any of this real?":** the DATA page lists every product, its link, and the five
  sources we checked and rejected with reasons. `scripts/sources.json` has the raw probe results.

---

## Beat spec for the automated guided mode

When the guided demo is built, it should drive the store directly rather than simulating clicks, and
hold each beat for the duration below.

| # | Duration | Store action | Caption |
|---|---|---|---|
| 1 | 4 s | `setMode('PLAN')`, default layers | "Lower Mount Sharp — real HiRISE terrain and Curiosity's driven path" |
| 2 | 6 s | `probePoint(centre of AOI)` | "Every layer, at one point, tagged for provenance" |
| 3 | 5 s | close probe | "Three stations on foot: GO, 30% consumables left" |
| 4 | 5 s | add GV-04, GV-05, BX-06 | "Six stations: NO-GO, and it says why" |
| 5 | 4 s | `setShowWalkBack(true)` | "Walk-back: can they still reach safety from here?" |
| 6 | 4 s | `setSuit({ mobility: 'rover' })` | "Rover-assisted — drop-off where it can't follow" |
| 7 | 2 s | hold | "Same science, 62% consumables left" |

Total 30 s. The mode should be interruptible by any user input, and should restore the store to its
pre-demo state when it ends.
