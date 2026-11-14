# MARSWALK — 7-slide outline

NASA Space Apps Challenge 2026 · "Interplanetary Survival Guide: Martian Map"

Speaker notes are the indented lines. Keep each slide to one idea; the demo carries the detail.

---

## 1 — The problem

> **An EVA is not a hike.**
>
> Fixed consumables. No rescue. A surface that is mostly unwalkable.

**The question a planner actually has to answer:**

> At every single step of this traverse, if something fails *right now*, can these two people
> still reach safety with their reserve intact?

    That is not "what is the shortest path to the science". It is a different question, and almost
    every mapping tool answers the first one. We built the tool that answers the second.

    One number to land: 58.4% of our area is walkable by a suited crew. A quarter of it has no
    stereo coverage at all. You cannot eyeball that off a picture.

---

## 2 — The solution

**MARSWALK: plan the walk, then walk it.**

Four displays, one plan underneath:

- **PLAN** — nine layers over the real ground, click anywhere for every value at that point
- **3D** — the real terrain, route draped on it, fly it through
- **HUD** — the same plan from inside the helmet
- **DATA** — every source, every provenance tag, and what we rejected

    The point is that these are not four tools. The visor reads the same plan object the map is
    showing, so the field view can never drift from the plan.

---

## 3 — The data

**Real ground, not a simulation.** 6.77 × 14.62 km of lower Mount Sharp — the footprint of the
HiRISE stereo DTM that covers Curiosity's actual traverse.

| | |
|---|---|
| Elevation | HiRISE stereo DTM, 32-bit float, 1.01 m/post — **REAL** |
| Basemap | HiRISE mosaic from NASA Mars Trek — **REAL** |
| Rover path | 1,039 surveyed positions, sols 1167–5073 — **REAL** |
| Station views | 18 Curiosity Navcam frames — **REAL** |
| Slope, hazards, regions | computed from the DTM — **DERIVED** |
| Radiation, weather | from published RAD and REMS results — **MODELED** |

    Three tags, shown on every layer card, in the click readout, and on the DATA page. Nothing
    derived or modelled is ever presented as a measurement.

    We also publish what we rejected. Trek serves a "Gale DEM" layer — but as 8-bit greyscale
    tiles, about five grey levels per tile, roughly 14 m of elevation per level. Fine as a picture,
    useless for slope. We went to the PDS float product instead and recorded why.

---

## 4 — Demo

Live walkthrough, ~90 seconds. See `demo-script.md` for the 30-second cut.

1. Layers on the real HiRISE ground; click once — every layer answers, each tagged
2. The solved route: **GO**, 7.92 km, 4:51, 30% consumables left
3. Add the upper stations → **NO-GO**, and the reason is specific
4. Switch to rover-assisted → drop-off point appears, 62% consumables left
5. 3D, then HUD — same plan, crew's eye

    If anything breaks, the fallback is the DATA page: it is generated from the live layer
    registry, so it is always current.

---

## 5 — Safety features

**The walk-back check is the product.**

- Multi-source Dijkstra from every safe haven, edges relaxed *toward* the haven — climbing out and
  walking back down are not the same cost
- Checked at ~1,000 route samples, not just at stations
- Violations turn red on the map, the profile, the 3D line **and** the visor
- Rover mode adds drop-offs as havens: reaching the rover ends the emergency
- Terrain with no stereo coverage is barred outright — we do not route across ground we cannot see
- Forecast solar particle event inside the EVA window is a NO-GO, with one click to re-time

**The honest answer we found:** Curiosity's full six-station traverse is **not walkable in one
EVA** — 17.07 km, 11.44 h of consumables against an 8 h budget. Rover assistance takes it from five
violations to three. It still does not make it legal.

    That is the slide to linger on. A planner that only ever says yes is not a planner.

---

## 6 — Impact

**For mission design:** turns "is this traverse safe?" from a judgement call into a number you can
check, and shows exactly where the margin runs out.

**For vehicle trade studies:** the rover is barred from steeper ground than the crew is (15° vs
25°). That asymmetry is what creates drop-off points — and the tool prices it: longer route, an hour
quicker, twice as cheap in consumables.

**For the challenge itself:** a worked example of provenance discipline. Every endpoint opened and
probed before use, the probe results committed, and the rejected sources published with reasons.

**Beyond Mars:** the same walk-back model is how lunar EVA traverses are planned today, and the
adapter seam means a different DEM and a different AOI is a config change.

---

## 7 — Team

_(names, roles, affiliation)_

**Built with:** Vite · React · TypeScript · Leaflet · three.js · Python (numpy, pillow, requests).
Claude (Anthropic) as a pair programmer for research, pipeline and application code.

**Data:** NASA/JPL-Caltech · NASA/JPL-Caltech/University of Arizona · NASA/JPL-Caltech/MSSS · USGS.

> Not affiliated with, endorsed by, or sponsored by NASA. No NASA logo or insignia used as branding.

**Live:** https://ertan123456.github.io/marswalk/
**Mirror:** https://walk-back.vercel.app (blocked on some networks)
**Repository:** https://github.com/ertan123456/marswalk
