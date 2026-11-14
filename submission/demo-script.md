# MARSWALK — 30-second demo script

**Live:** https://ertan123456.github.io/marswalk/ · **Repository:** https://github.com/ertan123456/marswalk

Voiceover with the exact on-screen action for each beat. Total 30 s at a steady reading pace
(~85 words). Timings are cumulative.

**Two ways to run it.** A presenter can drive the beats below by hand, or press **`G`** and let the
app's **Guided demo** auto-play a 60-second tour of the same arc, then restore the state it started
from. Any input interrupts it. Use the automated tour when the room is noisy or the clock is tight;
drive it by hand when you want to stop on a beat and answer a question.

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
- **If it can stretch to 60, add the assistant.** Type *"why is this GO?"* into the Mission AI panel
  and read the answer out. The line to land while it types: *"it explains the plan — it doesn't
  compute it. Every number in that answer came from the planner."* Point at the badge: it says which
  engine answered.

## Fallbacks

- **The map does not load:** switch to the DATA tab. It is generated from the live layer registry
  and needs no terrain, so it always renders — and it is the strongest provenance story anyway.
- **The 3D view is slow on the demo machine:** skip it. Nothing in the 30-second cut needs it.
- **Asked "is any of this real?":** the DATA page lists every product, its link, and the five
  sources we checked and rejected with reasons. `scripts/sources.json` has the raw probe results.
- **Asked "does the AI make up the numbers?":** no — and say how it is prevented. The context
  builder is the only thing the model receives, the prompt forbids estimating, and a deterministic
  answer is computed first and passed to the model as ground truth. The badge on the published site
  reads `local analyst` because a static host runs no server code; the numbers are the same either
  way. `AI_SETUP.md` covers running the model engine locally.
- **Asked about accessibility:** walk-back violations are dashed as well as red, everything is
  keyboard-operable (`1`–`5`, `G`, `M`, `W`, `L`, `Esc`) with visible focus, and the DATA page has an
  Accessibility section that also lists what is *not* solved.

---

## The automated guided mode, as built

`G` or the **Guided demo** button. Ten beats, 60 s, defined in `src/lib/tour.ts`. It drives the
Zustand store directly rather than simulating clicks, so the captions and the state can never
disagree; it snapshots the store on entry and restores it on exit; and any user input interrupts it.

| # | Hold | Caption |
|---|---|---|
| 1 | 5 s | "Lower Mount Sharp — real HiRISE terrain, and the path Curiosity actually drove" |
| 2 | 6 s | "Click anywhere: every layer answers, each tagged REAL, DERIVED or MODELED" |
| 3 | 5 s | "Three stations on foot — 7.92 km, 4:51, 30% of consumables left. GO." |
| 4 | 6 s | "Add the upper stations and it fails — and it says exactly why" |
| 5 | 6 s | "Walk-back: at every step, could the crew still reach safety with their reserve?" |
| 6 | 6 s | "Rover-assisted — barred from steeper ground than the crew, so it drops them off" |
| 7 | 7 s | "The same terrain in three dimensions, clipped to the real stereo footprint" |
| 8 | 8 s | "Fly the route the planner solved" |
| 9 | 7 s | "And the crew sees the same plan from inside the helmet" |
| 10 | 4 s | "Every number here is computed from real NASA data. The DATA tab shows every source." |

Under `prefers-reduced-motion` the tour still advances through every beat; it cuts between them
instead of easing.
