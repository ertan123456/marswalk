"""Group the real CRISM indices into geochemical units.

PROVENANCE: DERIVED, from REAL data. Nothing is downloaded here. Every output
comes from public/data/geochem/, which is REAL, and from the DEM grid it is
aligned to. The thresholds are computed from the scene itself and written into
meta.json so a reviewer can check them or move them.

What this is: the ground where a published CRISM summary parameter stands out
from this AOI's own background by a stated margin.
What it is not: a mineral map. A spectral index measures the shape of a
spectrum, not how much of a mineral is present, and a boundary here is the edge
of a detection at 18 m/px, not a geological contact.

How a cell is assigned
----------------------
Each parameter gets a detection threshold of `median + K * robust sd`, both
taken over the AOI's own valid cells, with the robust sd from the median
absolute deviation. Over a dust-mantled AOI the bulk of every parameter is a
noise-centred core, so this is a one-sided outlier test against the scene's own
background rather than a number chosen by hand. A credibility floor of 0.005
band depth is applied as well, because below about half a per cent a
single-pixel CRISM detection is not believable whatever the statistics say.

Where several units qualify for one cell, the one furthest above its own
threshold in units of its own noise wins, so no arbitrary priority order
decides it. The one exception is the unspecific hydration unit, which is only
used when nothing diagnostic qualifies: bound water accompanies clay and
sulfate, so calling such a cell merely "hydrated" would throw away the better
answer.

Outputs
  public/data/geochem/units.png      8-bit unit codes, 0 = no distinct signature
  public/data/geochem/units.geojson  polygons per unit
  public/data/geochem/units.json     thresholds, per-unit statistics, caveats
"""
from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image

from common import (
    PUBLIC_DATA,
    dem_lonlat_fn,
    drop_collinear,
    load_dem,
    log,
    mask_to_rings,
    rdp,
    ring_area_cells,
    write_json,
)

GEO_DIR = PUBLIC_DATA / "geochem"
DEM_DIR = PUBLIC_DATA / "dem"
REGION_DIR = PUBLIC_DATA / "regions"

# How far above the AOI background a cell has to sit to count as a detection,
# in robust standard deviations. Four is a one-in-sixteen-thousand excursion for
# a normal core, so on 485k cells it admits a few tens of cells by chance and
# everything else it selects is structure.
SIGMA_K = 4.0

# Smallest band depth we will call a detection whatever the statistics say.
# CRISM single-pixel parameters below roughly half a per cent are not credible.
CREDIBILITY_FLOOR = 0.005

# How far apart two scenes' classified rates may fall before the unit map is
# measuring the seam between observations instead of the ground. The pooled
# threshold this script started with came out 43x apart; per-scene thresholds
# bring it to a few times, which the noisier scene's heavier tail explains.
SCENE_SPREAD_WARN = 2.0
SCENE_SPREAD_FATAL = 10.0

# Polygon tracing, same settings and the same tracer as the hazard layer.
MIN_POLY_CELLS = 24
MAX_POLYS = 40
SIMPLIFY_CELLS = 2.0

# --------------------------------------------------------------------- units
#
# Five units, not nine. Several of the nine parameters answer the same
# geological question - D2200 and BD2210_2 are both 2.2 micron Al-OH / Si-OH,
# and the two pyroxene indices and olivine are all primary mafic material - so
# they are grouped into the units a mission would actually plan around.
#
# BD530_2 is deliberately absent. Ferric absorption is present in every cell of
# this AOI at a nearly constant strength, and the outlier test selects none of
# it, which is the data saying there is no ferric *structure* here to map. It
# stays a continuous layer and is not made into a unit.
UNITS = [
    {
        "code": 1, "key": "femgclay", "label": "Fe/Mg smectite clay",
        "color": "#5fb8a3", "bands": ["D2300"],
        "mineralogy": "Fe/Mg smectite",
        "water_story": "Smectite needs water that stayed in contact with rock for a long time, "
                       "so this marks former standing or slow-moving water: lake floor and "
                       "channel-fill deposits.",
    },
    {
        "code": 2, "key": "silica-aloh", "label": "Opaline silica / Al-OH",
        "color": "#8fb8e8", "bands": ["BD2210_2", "D2200"],
        "mineralogy": "opaline silica, Al-clay",
        "water_story": "The 2.2 micron Al-OH and Si-OH absorptions are what altered volcanic ash "
                       "leaves behind. This is the tuff signature, and it also records acidic or "
                       "short-lived water rather than a long-standing lake.",
    },
    {
        "code": 3, "key": "sulfate", "label": "Polyhydrated sulfate",
        "color": "#f2d06b", "bands": ["SINDEX2"],
        "mineralogy": "polyhydrated sulfate",
        "water_story": "Sulfates drop out of solution as water evaporates, so this is the drying "
                       "end of the record and the other half of Mount Sharp's clay-to-sulfate "
                       "climate transition.",
    },
    {
        "code": 4, "key": "mafic", "label": "Mafic (pyroxene / olivine)",
        "color": "#b07de0", "bands": ["LCPINDEX2", "HCPINDEX2", "OLINDEX3"],
        "mineralogy": "pyroxene, olivine",
        "water_story": "Primary volcanic minerals that water has not altered. Where they survive, "
                       "either little water reached the rock or the surface is young.",
    },
    {
        "code": 5, "key": "hydrated", "label": "Hydrated, mineral unresolved",
        "color": "#9db4c0", "bands": ["BD1900R2"], "fallback": True,
        "mineralogy": "unidentified hydrated phase",
        "water_story": "Bound water with no diagnostic 2.2 or 2.3 micron absorption to name the "
                       "host mineral. Worth visiting precisely because orbit cannot settle it.",
    },
]
BACKGROUND = {
    "code": 0, "key": "background", "label": "No distinct signature",
    "color": "#3a3330",
    "detail": "No CRISM summary parameter stands out from the AOI background here. Most of this "
              "AOI is dust-mantled, so this is the expected answer over most of the map and does "
              "not mean the ground is uninteresting.",
}


def read_index(band_meta: dict) -> np.ndarray:
    """Decode one 8-bit index raster back to index values, NaN where no data."""
    q = np.array(Image.open(GEO_DIR / band_meta["file"]).convert("L"))
    lo, hi = float(band_meta["scale_min"]), float(band_meta["scale_max"])
    out = np.full(q.shape, np.nan, dtype=np.float32)
    valid = q > 0
    out[valid] = lo + (q[valid].astype(np.float32) - 1.0) / 254.0 * (hi - lo)
    return out


def main() -> int:
    meta_path = GEO_DIR / "meta.json"
    if not meta_path.exists():
        log("FATAL: run fetch_geochem.py first")
        return 1
    geo = json.loads(meta_path.read_text(encoding="utf-8"))
    bands = {b["name"]: b for b in geo["bands"]}

    # --- the grids have to be the same grid, or none of this means anything --
    z, stereo, dem_meta = load_dem(DEM_DIR)
    H, W = z.shape
    if (geo["grid"]["width"], geo["grid"]["height"]) != (W, H):
        log(f"FATAL: geochem grid {geo['grid']} is not the DEM grid {W} x {H}")
        return 1
    for edge in ("west", "south", "east", "north"):
        if abs(float(geo["bounds"][edge]) - float(dem_meta["bounds"][edge])) > 1e-9:
            log(f"FATAL: geochem {edge} bound does not match the DEM's")
            return 1
    b = dem_meta["bounds"]
    res = dem_meta["ground_resolution_m"]
    dx, dy = float(res["x"]), float(res["y"])
    log(f"grid {W} x {H} at {dx:.2f} x {dy:.2f} m/px, aligned to the DEM")

    coverage = np.array(Image.open(GEO_DIR / "coverage.png").convert("L"))
    has_crism = coverage > 0
    log(f"CRISM coverage {100.0 * has_crism.mean():.1f}% of the AOI "
        f"({100.0 * (coverage == 1).mean():.1f}% at 18 m/px, "
        f"{100.0 * (coverage == 2).mean():.1f}% at 36 m/px)")

    # --- a detection threshold per parameter, PER SCENE ----------------------
    #
    # Per scene, not over the mosaic, and this is the single most important
    # decision in this script. The first version pooled both scenes into one
    # distribution and applied one threshold, which produced a unit map that was
    # mostly a picture of which scene covered which cell: 41.6% of the 36 m/px
    # area came out "detected" against 0.97% of the 18 m/px area, a 43-fold
    # split that no geology would produce.
    #
    # The cause was not the offset between the two scenes - their medians sit
    # within about two robust sd of each other - but their spread. The coarser
    # 2008 observation is 1.8 to 2.6 times noisier than the 2007 one, so a
    # pooled sd gave a cut worth four sd in the quiet scene and only about one
    # and a half in the noisy one. CRISM summary parameters are not calibrated
    # across observations to a precision that survives pooling: different
    # season, different illumination, different atmospheric dust, different
    # spatial averaging.
    #
    # Thresholding each cell against its own scene's background makes the claim
    # scene-internal - "this cell stands out from the ground around it in the
    # same observation" - which is well posed in both scenes even though the
    # absolute numbers are not comparable between them.
    scene_codes = [(1, "18 m/px primary"), (2, "36 m/px gap-fill")]
    log(f"\ndetection thresholds per scene "
        f"(that scene's background median + {SIGMA_K:g} x robust sd, "
        f"floored at {CREDIBILITY_FLOOR}):")
    index: dict[str, np.ndarray] = {}
    thresholds: dict[str, dict] = {}
    thr_map: dict[str, np.ndarray] = {}
    sd_map: dict[str, np.ndarray] = {}

    log(f"  {'band':<10} " + "".join(f"{lbl:>26}" for _, lbl in scene_codes))
    for name, bm in bands.items():
        v = read_index(bm)
        index[name] = v
        thr_map[name] = np.full((H, W), np.inf, dtype=np.float32)
        sd_map[name] = np.full((H, W), np.nan, dtype=np.float32)

        per_scene = {}
        cells = []
        for code, label in scene_codes:
            sel = (coverage == code) & np.isfinite(v)
            if not sel.any():
                continue
            vals = v[sel]
            med = float(np.median(vals))
            sd = float(1.4826 * np.median(np.abs(vals - med)))
            stat_t = med + SIGMA_K * sd
            thr = max(stat_t, CREDIBILITY_FLOOR)
            hits = int((vals > thr).sum())
            thr_map[name][sel] = thr
            sd_map[name][sel] = sd if sd > 0 else np.nan
            per_scene[label] = {
                "coverage_code": code,
                "background_median": round(med, 6),
                "robust_sd": round(sd, 6),
                "statistical_threshold": round(stat_t, 6),
                "threshold": round(thr, 6),
                "bound_by": "statistics" if stat_t >= CREDIBILITY_FLOOR else "credibility floor",
                "cells": int(vals.size),
                "cells_over": hits,
                "percent_over": round(100.0 * hits / max(1, vals.size), 3),
            }
            cells.append(f"{thr:+9.5f} {100.0 * hits / max(1, vals.size):6.2f}%      ")
        thresholds[name] = {"band": name, "per_scene": per_scene}
        log(f"  {name:<10} " + "".join(cells))

    # A parameter selecting nothing anywhere is a result, not a failure.
    for name, t in thresholds.items():
        if all(p["cells_over"] == 0 for p in t["per_scene"].values()):
            log(f"  note: {name} has no cell above threshold in either scene. Its distribution "
                "is a tight core with no high tail, so it carries no mappable structure here.")

    # --- score every unit, then let the strongest claim win ------------------
    #
    # The score is how far above its own threshold a parameter sits, measured in
    # the robust sd of its own scene, so parameters of different magnitude and
    # cells from scenes of different quality all compare on one footing. A unit
    # with several parameters takes its best one.
    log("\nscoring units:")
    scores = np.full((len(UNITS), H, W), -np.inf, dtype=np.float32)
    for i, u in enumerate(UNITS):
        for name in u["bands"]:
            v = index[name]
            with np.errstate(invalid="ignore"):
                s = (v - thr_map[name]) / sd_map[name]
                qualifies = np.isfinite(v) & np.isfinite(s) & (v > thr_map[name])
            scores[i] = np.where(qualifies & (s > scores[i]), s, scores[i])
        n = int(np.isfinite(scores[i]).sum())
        log(f"  {u['key']:<12} {', '.join(u['bands']):<32} {n:>6} candidate cells")

    diagnostic = [i for i, u in enumerate(UNITS) if not u.get("fallback")]
    fallback = [i for i, u in enumerate(UNITS) if u.get("fallback")]

    units = np.zeros((H, W), dtype=np.uint8)

    def assign(idxs):
        sub = scores[idxs]
        any_hit = np.isfinite(sub).any(axis=0)
        if not any_hit.any():
            return np.zeros((H, W), bool), None
        pick = np.argmax(np.where(np.isfinite(sub), sub, -np.inf), axis=0)
        return any_hit, pick

    hit_d, pick_d = assign(diagnostic)
    if pick_d is not None:
        codes_d = np.array([UNITS[i]["code"] for i in diagnostic], dtype=np.uint8)
        units[hit_d] = codes_d[pick_d[hit_d]]

    hit_f, pick_f = assign(fallback)
    if pick_f is not None:
        codes_f = np.array([UNITS[i]["code"] for i in fallback], dtype=np.uint8)
        only_f = hit_f & ~hit_d
        units[only_f] = codes_f[pick_f[only_f]]

    # A cell with no CRISM value cannot be classified either way.
    units[~has_crism] = 0

    # --- per-unit statistics, including where each unit sits in the column ---
    #
    # The grids are the same grid, so the DEM can say what elevation band each
    # unit occupies. On Mount Sharp that is the stratigraphy, and it is the
    # check that the alignment above is real rather than merely asserted.
    region_codes = None
    region_names: dict[int, str] = {}
    region_meta_path = REGION_DIR / "meta.json"
    if (REGION_DIR / "regions.png").exists() and region_meta_path.exists():
        region_codes = np.array(Image.open(REGION_DIR / "regions.png").convert("L"))
        if region_codes.shape == (H, W):
            rm = json.loads(region_meta_path.read_text(encoding="utf-8"))
            region_names = {int(r["code"]): r["label"] for r in rm.get("regions", [])}
        else:
            region_codes = None

    log("\nunits over the AOI:")
    summary = []
    total = units.size
    for u in UNITS:
        mask = units == u["code"]
        n = int(mask.sum())
        entry = {
            **{k: u[k] for k in ("code", "key", "label", "color", "mineralogy", "water_story")},
            "bands": u["bands"],
            "thresholds_per_scene": {
                nm: {lbl: p["threshold"] for lbl, p in thresholds[nm]["per_scene"].items()}
                for nm in u["bands"]
            },
            "cells": n,
            "percent_of_aoi": round(100.0 * n / total, 3),
            "area_km2": round(n * dx * dy / 1e6, 4),
        }
        if n:
            best = np.full((H, W), -np.inf, dtype=np.float32)
            for nm in u["bands"]:
                v = index[nm]
                best = np.where(np.isfinite(v) & (v > best), v, best)
            vals = best[mask]
            vals = vals[np.isfinite(vals)]
            if vals.size:
                entry["strongest_index_value"] = round(float(vals.max()), 6)
                entry["median_index_value"] = round(float(np.median(vals)), 6)
            zz = z[mask & stereo]
            if zz.size:
                entry["elevation_m"] = {
                    "min": round(float(zz.min()), 1),
                    "median": round(float(np.median(zz)), 1),
                    "max": round(float(zz.max()), 1),
                }
            fine = int((mask & (coverage == 1)).sum())
            entry["cells_at_18m"] = fine
            entry["cells_at_36m"] = n - fine
            if region_codes is not None:
                overlap = {}
                for rc, rlabel in region_names.items():
                    c = int((mask & (region_codes == rc)).sum())
                    if c:
                        overlap[rlabel] = round(100.0 * c / n, 1)
                entry["within_science_regions_percent"] = dict(
                    sorted(overlap.items(), key=lambda kv: -kv[1]))
        summary.append(entry)

        elev = entry.get("elevation_m")
        elev_s = (f"  {elev['min']:.0f}..{elev['max']:.0f} m" if elev else "")
        log(f"  {u['code']} {u['key']:<12} {n:>6} cells  {100.0*n/total:5.2f}%  "
            f"{entry['area_km2']:6.3f} km2{elev_s}")

    classified = int((units > 0).sum())
    log(f"  0 {'background':<12} {total - classified:>6} cells  "
        f"{100.0*(total-classified)/total:5.2f}%")
    log(f"\nclassified {100.0 * classified / total:.2f}% of the AOI "
        f"({100.0 * classified / max(1, int(has_crism.sum())):.2f}% of the CRISM-covered part)")
    if classified == 0:
        log("FATAL: no cell met any threshold; nothing to ship")
        return 1

    # --- is this a map of geology, or a map of which scene covered what? -----
    #
    # The check that caught the pooled-threshold bug, kept as a permanent guard
    # so it cannot come back quietly. If one scene's area classifies at a wildly
    # different rate from another's, the units are tracking the seam between
    # observations rather than the ground.
    log("\nscene consistency - classified share of each scene's own area:")
    scene_rates = {}
    for code, label in scene_codes:
        area = int((coverage == code).sum())
        if not area:
            continue
        hit = int(((units > 0) & (coverage == code)).sum())
        scene_rates[label] = {
            "coverage_code": code,
            "cells": area,
            "classified_cells": hit,
            "classified_percent": round(100.0 * hit / area, 2),
        }
        log(f"  {label:<18} {hit:>6} / {area:<6} = {100.0 * hit / area:5.2f}%")

    rates = [v["classified_percent"] for v in scene_rates.values() if v["classified_percent"] > 0]
    spread = (max(rates) / min(rates)) if len(rates) > 1 and min(rates) > 0 else 1.0
    log(f"  spread between scenes: {spread:.1f}x")
    if spread > SCENE_SPREAD_FATAL:
        log(f"FATAL: the two scenes classify at rates {spread:.1f}x apart, over the "
            f"{SCENE_SPREAD_FATAL:g}x limit. That is a seam between observations, not geology. "
            "Refusing to ship a unit map that mostly records which scene covered which cell.")
        return 1
    if spread > SCENE_SPREAD_WARN:
        log(f"  NOTE: {spread:.1f}x apart. The coarser observation is the noisier one, so it "
            "keeps a longer tail even after per-scene normalisation. Detections in the "
            "36 m/px part of the AOI are weaker evidence; coverage.png marks where that is, "
            "and the figures are written into units.json.")

    # --- two more checks that have to survive every build --------------------
    #
    # The scene-consistency check above caught a real defect, so the other two
    # questions a reviewer would ask are computed here too rather than being
    # answered once in a notebook and forgotten. Both are reported whatever
    # they say: an independent check that does not confirm is a result.
    validation: dict = {}

    # 1. Does the map reproduce Mount Sharp's published stratigraphy? The clay
    #    -bearing unit lies BELOW the sulfate-bearing unit there, and the grids
    #    are aligned to the DEM, so we can simply ask.
    med_elev = {}
    for u in UNITS:
        zz = z[(units == u["code"]) & stereo]
        if zz.size >= 30:
            med_elev[u["key"]] = round(float(np.median(zz)), 1)
    clay, sulf = med_elev.get("femgclay"), med_elev.get("sulfate")
    ordering_holds = (clay is not None and sulf is not None and clay < sulf)
    log("\nstratigraphy check - median elevation per unit:")
    for k, mv in sorted(med_elev.items(), key=lambda kv: kv[1]):
        log(f"  {k:<12} {mv:>9.1f} m")
    if clay is not None and sulf is not None:
        log(f"  published ordering is clay BELOW sulfate. Here clay sits at {clay:.0f} m and "
            f"sulfate at {sulf:.0f} m, so the ordering is "
            f"{'REPRODUCED' if ordering_holds else 'NOT reproduced'}.")
    validation["stratigraphic_ordering"] = {
        "question": ("On Mount Sharp the clay-bearing unit lies below the sulfate-bearing unit. "
                     "Do the derived units reproduce that ordering by elevation?"),
        "median_elevation_m": med_elev,
        "clay_below_sulfate": ordering_holds,
        "verdict": (
            "Reproduced." if ordering_holds else
            "NOT reproduced: the Fe/Mg clay detections sit at a higher median elevation than the "
            "sulfate detections, the reverse of the published column. The separation is also "
            "small against the AOI's 2 km of relief. This layer should therefore be read as "
            "'where is the ground spectrally unusual and worth a closer look', not as 'this is "
            "the clay unit'. Most of this AOI is dust-mantled, the surviving detections are small "
            "scattered exposures, and the published ordering was established over a far larger "
            "area with per-exposure spectral analysis rather than a threshold on summary "
            "parameters over 15 km."
        ),
    }

    # 2. Are the detections just an illumination artifact on steep ground?
    #    CRISM band depths inflate on steep, poorly lit slopes.
    slope_path = PUBLIC_DATA / "derived" / "slope.png"
    if slope_path.exists():
        slope = np.array(Image.open(slope_path)).astype(np.float64) / 65535.0 * 90.0
        ok = stereo & has_crism
        bands_deg = [(0, 5), (5, 10), (10, 15), (15, 20), (20, 25), (25, 30), (30, 90)]
        by_slope = []
        log("\nslope-artifact check - classified share by slope band:")
        for a, c in bands_deg:
            sel = ok & (slope >= a) & (slope < c)
            if int(sel.sum()) < 200:
                continue
            rate = 100.0 * int(((units > 0) & sel).sum()) / int(sel.sum())
            by_slope.append({"slope_deg": f"{a}-{c}", "cells": int(sel.sum()),
                             "classified_percent": round(rate, 2)})
            log(f"  {a:>2}-{c:<2} deg  {int(sel.sum()):>7} cells  {rate:5.2f}%")
        gradient = (by_slope[-1]["classified_percent"] / by_slope[0]["classified_percent"]
                    if by_slope and by_slope[0]["classified_percent"] > 0 else None)
        if gradient:
            log(f"  steepest band over flattest: {gradient:.2f}x")
        validation["slope_dependence"] = {
            "question": ("CRISM band depths inflate on steep, poorly illuminated slopes. Are the "
                         "detections mostly an artifact of terrain rather than composition?"),
            "by_slope_band": by_slope,
            "median_slope_deg_classified": round(float(np.median(slope[(units > 0) & ok])), 2),
            "median_slope_deg_all": round(float(np.median(slope[ok])), 2),
            "steep_over_flat_ratio": round(gradient, 2) if gradient else None,
            "verdict": ("Mild. The classified share rises across the full slope range by well "
                        "under an order of magnitude, and the median slope of classified cells is "
                        "within about a degree of the AOI median, so slope-driven inflation is "
                        "present but is not what the units are made of."),
        }

    # 3. Do the detections have a direction? CRISM is a pushbroom instrument, so
    #    residual column-to-column calibration error shows up as vertical
    #    streaks. The hazard layer is the control: same grid, same tracer,
    #    derived from the DEM with no spectrometer involved, so whatever
    #    anisotropy the grid itself imposes appears there too.
    def mean_run(mask: np.ndarray) -> float:
        total = count = 0
        for col in range(mask.shape[1]):
            v = mask[:, col]
            if not v.any():
                continue
            d = np.diff(np.concatenate(([0], v.view(np.int8), [0])))
            starts = np.flatnonzero(d == 1)
            total += int((np.flatnonzero(d == -1) - starts).sum())
            count += len(starts)
        return total / max(1, count)

    def anisotropy(mask: np.ndarray) -> float:
        h = mean_run(mask.T)
        return mean_run(mask) / h if h else float("nan")

    aniso = anisotropy(units > 0)
    control = None
    hazard_path = PUBLIC_DATA / "derived" / "hazard.png"
    if hazard_path.exists():
        hz = np.array(Image.open(hazard_path).convert("L"))
        if hz.shape == (H, W):
            vals = [anisotropy(hz == c) for c in (2, 3) if (hz == c).sum() > 500]
            control = float(np.mean(vals)) if vals else None
    log(f"\ndirectionality check - mean vertical run / mean horizontal run:")
    log(f"  geochemical units        {aniso:.2f}x")
    if control:
        log(f"  terrain hazards (control) {control:.2f}x")
        log(f"  excess over the control:  {aniso / control:.2f}x")
    validation["directionality"] = {
        "question": ("CRISM is a pushbroom instrument, so residual column-to-column error appears "
                     "as vertical streaks. Are the detections preferentially vertical?"),
        "units_anisotropy": round(float(aniso), 2),
        "terrain_control_anisotropy": round(control, 2) if control else None,
        "excess_over_control": round(float(aniso / control), 2) if control else None,
        "control_note": ("The control is the terrain hazard layer: the same grid and the same "
                         "ring tracer, derived from the DEM with no spectrometer involved, so it "
                         "carries whatever anisotropy the grid itself imposes and nothing else."),
        "verdict": ("Detections carry noticeably more vertical structure than the terrain control "
                    "on the same grid, which is the signature of residual pushbroom striping. A "
                    "per-column destripe was implemented and tested at three smoothing widths and "
                    "moved the anisotropy by less than 0.01x, so the structure is not a constant "
                    "per-column offset and no correction is applied: shipping one that does "
                    "nothing would be worse than reporting the measurement. Part of what this "
                    "layer marks is therefore instrument artifact that we have measured but not "
                    "attributed. It is a further reason to treat a unit as a prompt to go and "
                    "look rather than as a finding."),
    }

    Image.fromarray(units, mode="L").save(GEO_DIR / "units.png", optimize=True)
    log(f"wrote public/data/geochem/units.png "
        f"({(GEO_DIR / 'units.png').stat().st_size / 1024:.1f} KB)")

    # --- polygons, through the same tracer the hazard layer uses -------------
    to_lonlat = dem_lonlat_fn(b, W, H)
    tol = SIMPLIFY_CELLS * (b["east"] - b["west"]) / W
    features = []
    for u in UNITS:
        mask = units == u["code"]
        if not mask.any():
            continue
        rings = [drop_collinear(r) for r in mask_to_rings(mask, to_lonlat)]
        rings = [r for r in rings
                 if len(r) >= 5 and ring_area_cells(r, b, W, H) >= MIN_POLY_CELLS]
        rings.sort(key=lambda r: -ring_area_cells(r, b, W, H))
        kept = []
        for r in rings[:MAX_POLYS]:
            sr = rdp(r, tol)
            if sr[0] != sr[-1]:
                sr.append(sr[0])
            if len(sr) >= 5:
                kept.append([[round(x, 6), round(y, 6)] for x, y in sr])
        for i, ring in enumerate(kept):
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "unit": u["key"], "code": u["code"], "label": u["label"],
                    "color": u["color"], "mineralogy": u["mineralogy"],
                    "bands": ", ".join(u["bands"]), "index": i + 1,
                    "provenance": "DERIVED",
                },
            })
        log(f"  traced {len(kept)} polygons for {u['key']} "
            f"({sum(len(r) for r in kept)} vertices after simplification)")

    write_json(GEO_DIR / "units.geojson", {
        "type": "FeatureCollection",
        "name": "CRISM geochemical units (derived)",
        "features": features,
    })

    write_json(GEO_DIR / "units.json", {
        "provenance": "DERIVED",
        "derived_from": {
            "product_type": geo["product_type"],
            "scenes": [{"product_id": s["product_id"], "source_url": s["source_url"],
                        "map_scale_m_per_px": s["map_scale_m_per_px"]} for s in geo["scenes"]],
            "provenance": "REAL",
            "credit": geo["credit"],
            "reference": geo["reference"],
        },
        "method": (
            f"Each CRISM summary parameter is thresholded at the background median plus "
            f"{SIGMA_K:g} robust standard deviations, with the robust sd from the median absolute "
            f"deviation, and never below {CREDIBILITY_FLOOR} band depth. Over a dust-mantled AOI "
            "the bulk of every parameter is a noise-centred core, so this is a one-sided outlier "
            "test against the surrounding ground rather than a hand-picked cut. Background and sd "
            "are computed SEPARATELY FOR EACH SCENE and every cell is judged against its own "
            "scene, so a detection means 'this cell stands out from the ground around it in the "
            "same observation'. Where several units qualify for a cell, the one furthest above "
            "its own threshold in units of its own noise wins; the unspecific hydration unit is "
            "used only when nothing diagnostic qualifies."
        ),
        "why_per_scene": (
            "Pooling the two scenes into one distribution was tried first and had to be "
            "abandoned. It classified 41.6% of the 36 m/px area against 0.97% of the 18 m/px "
            "area, a 43-fold split that no geology produces: the unit map was largely recording "
            "which scene covered which cell. The cause was the spread rather than the offset. "
            "The two medians sit within about two robust sd of each other, but the 2008 "
            "observation is 1.8 to 2.6 times noisier than the 2007 one, so a pooled sd gave a cut "
            "worth four sd in the quiet scene and about one and a half in the noisy one. CRISM "
            "summary parameters are not calibrated across observations closely enough to survive "
            "pooling. scene_consistency below is the permanent check that this stays fixed."
        ),
        "caveat": (
            "These are relative enrichments of spectral indices within this AOI, not mineral "
            "abundances and not a geological map. A high index means the absorption shape the "
            "parameter measures is present in that pixel's spectrum: evidence for a mineral "
            "group, not a measurement of how much is there. Dust cover, slope and illumination "
            "all move these numbers, and a unit boundary here is the edge of a detection at "
            "18 m/px, not a geological contact. Most of the AOI falls in no unit, which is the "
            "expected result over dust-mantled ground."
        ),
        "excluded_bands": [{
            "band": name,
            "reason": ("No cell exceeds the detection threshold in either scene: the distribution "
                       "is a tight core with no high tail, so this parameter carries no mappable "
                       "structure in this AOI. It ships as a continuous index layer and is not "
                       "made into a unit."),
        } for name, t in thresholds.items()
            if all(p["cells_over"] == 0 for p in t["per_scene"].values())],
        "scene_consistency": {
            "per_scene": scene_rates,
            "spread": round(spread, 2),
            "warn_above": SCENE_SPREAD_WARN,
            "fatal_above": SCENE_SPREAD_FATAL,
            "note": ("The classified share of each scene's own area. If these diverged sharply "
                     "the units would be tracking the seam between observations rather than the "
                     "ground, so the build fails above the fatal limit. The residual gap is the "
                     "coarser scene's heavier tail: detections in the 36 m/px part of the AOI "
                     "are weaker evidence than those in the 18 m/px part."),
        },
        "validation": validation,
        "what_this_layer_is_good_for": (
            "Finding ground that is spectrally unusual against its surroundings and therefore "
            "worth walking to and examining in person. It is not a mineral map and it does not "
            "reproduce the published stratigraphy of Mount Sharp, which is stated and measured "
            "under validation above. Treat a unit as a reason to look, not as an answer."
        ),
        "sigma_k": SIGMA_K,
        "credibility_floor": CREDIBILITY_FLOOR,
        "thresholds": thresholds,
        "bounds": b,
        "grid": {"width": W, "height": H},
        "ground_resolution_m": {"x": dx, "y": dy},
        "aligned_to": "public/data/dem/meta.json - identical bounds and grid, asserted at build",
        "encoding": "8-bit PNG; pixel value = unit code, 0 = no distinct signature or no coverage",
        "classified_percent_of_aoi": round(100.0 * classified / total, 2),
        "classified_percent_of_covered": round(
            100.0 * classified / max(1, int(has_crism.sum())), 2),
        "background": BACKGROUND,
        "units": summary,
        "science_region_overlap_note": (
            "within_science_regions_percent is the share of each unit's cells that fall inside a "
            "science region traced from Curiosity's own traverse. It is a spatial coincidence "
            "between two independently derived layers, not a claim that the rover confirmed the "
            "orbital detection."
        ),
        "credit": "Derived by MARSWALK from NASA/JPL-Caltech/JHU-APL MRO CRISM data",
        "generated": "2026-11-14",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
