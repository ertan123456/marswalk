"""Derive science-region extents from Curiosity's own traverse.

PROVENANCE: DERIVED, from REAL data.

The brief asks for the annotated regions on NASA's "Proposed Path up Mount
Sharp" figure. That figure ships no georeferencing control points, so tracing
it by eye would produce boundaries we could not defend. Instead each region is
built from where the rover actually was: take the surveyed waypoints inside the
sol window the mission spent working that unit, and mark every DEM cell within
a corridor radius of them.

What this is: the ground Curiosity covered while working each unit.
What it is not: a geological contact. Unit boundaries extend well beyond any
rover track, and nothing here should be read as mapping them.

The sol windows come from the mission record and are approximate; they are
written into the output so a reviewer can check or change them.

Outputs
  public/data/regions/regions.png    8-bit class codes
  public/data/regions/meta.json
"""
from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image

from common import PUBLIC_DATA, log, write_json

OUT_DIR = PUBLIC_DATA / "regions"
DEM_DIR = PUBLIC_DATA / "dem"
TRAVERSE = PUBLIC_DATA / "traverse" / "waypoints.geojson"

# Corridor half-width around the driven track, metres.
CORRIDOR_M = 220.0

# Approximate sol windows per unit, from the mission record. Listed in the
# order they are painted: later entries win where windows overlap, so the
# chronologically later campaign shows on ground the rover revisited.
REGIONS = [
    {
        "code": 1, "key": "clay", "label": "Clay-bearing unit (Glen Torridon)",
        "color": "#5fb8a3", "sols": [2300, 2750],
        "note": "Smectite-bearing lower unit. Clay needs water that stayed put, so this is the "
                "strongest habitability evidence in the AOI.",
    },
    {
        "code": 2, "key": "pediment", "label": "Greenheugh Pediment",
        "color": "#9db4c0", "sols": [2690, 2710],
        "note": "Erosional surface capped by younger sandstone. Dates a pause in deposition.",
    },
    {
        "code": 3, "key": "sulfate", "label": "Sulfate-bearing unit",
        "color": "#f2d06b", "sols": [3400, 3800],
        "note": "Sulfates precipitate as water dries. The clay-to-sulfate crossing is the biggest "
                "climate change recorded in Gale.",
    },
    {
        "code": 4, "key": "gv-ridge", "label": "Gediz Vallis Ridge",
        "color": "#e08a3c", "sols": [3850, 4050],
        "note": "Debris carried down from high on Mount Sharp - the only ground-level access to "
                "units the rover can never drive to.",
    },
    {
        "code": 5, "key": "gv-channel", "label": "Gediz Vallis Channel",
        "color": "#c2552f", "sols": [4100, 4400],
        "note": "The channel that debris came down. Cut by water or by dry landslides is still open.",
    },
    {
        "code": 6, "key": "boxwork", "label": "Boxwork region",
        "color": "#b07de0", "sols": [4600, 5200],
        "note": "Polygonal networks of mineral veins left by groundwater in fractures - the 2025 "
                "campaign, and the last chapter of habitability here.",
    },
]


def main() -> int:
    meta_path = DEM_DIR / "meta.json"
    if not meta_path.exists() or not TRAVERSE.exists():
        log("FATAL: run fetch_dem.py and fetch_traverse.py first")
        return 1

    dem_meta = json.loads(meta_path.read_text(encoding="utf-8"))
    b = dem_meta["bounds"]
    W = dem_meta["grid"]["width"]
    H = dem_meta["grid"]["height"]
    res = dem_meta["ground_resolution_m"]
    dx, dy = float(res["x"]), float(res["y"])
    log(f"grid {W} x {H} at {dx:.2f} x {dy:.2f} m/px")

    wps = json.loads(TRAVERSE.read_text(encoding="utf-8"))["features"]
    pts = []
    for f in wps:
        sol = (f.get("properties") or {}).get("sol")
        g = f.get("geometry") or {}
        if sol is None or g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][0], g["coordinates"][1]
        col = (lon - b["west"]) / (b["east"] - b["west"]) * W
        row = (b["north"] - lat) / (b["north"] - b["south"]) * H
        pts.append((int(sol), col, row))
    log(f"{len(pts)} surveyed waypoints with a sol, inside the AOI")

    # Corridor radius in cells, per axis (the cells are not quite square).
    rx = CORRIDOR_M / dx
    ry = CORRIDOR_M / dy
    rmax = int(np.ceil(max(rx, ry)))
    log(f"corridor {CORRIDOR_M:.0f} m -> {rx:.1f} x {ry:.1f} cells")

    codes = np.zeros((H, W), dtype=np.uint8)
    yy, xx = np.mgrid[-rmax:rmax + 1, -rmax:rmax + 1]
    disc = ((xx / rx) ** 2 + (yy / ry) ** 2) <= 1.0

    summary = []
    for r in REGIONS:
        lo, hi = r["sols"]
        sel = [(c, w) for s, c, w in pts if lo <= s <= hi]
        mask = np.zeros((H, W), dtype=bool)
        for col, row in sel:
            c0, r0 = int(round(col)), int(round(row))
            cs, ce = max(0, c0 - rmax), min(W, c0 + rmax + 1)
            rs, re = max(0, r0 - rmax), min(H, r0 + rmax + 1)
            if cs >= ce or rs >= re:
                continue
            sub = disc[rs - (r0 - rmax): re - (r0 - rmax), cs - (c0 - rmax): ce - (c0 - rmax)]
            mask[rs:re, cs:ce] |= sub
        codes[mask] = r["code"]
        cells = int(mask.sum())
        area_km2 = cells * dx * dy / 1e6
        summary.append({**r, "waypoints": len(sel), "cells": cells,
                        "area_km2": round(area_km2, 2)})
        log(f"  {r['key']:<11} sols {lo}-{hi:<5} {len(sel):>4} waypoints  "
            f"{cells:>6} cells  {area_km2:5.2f} km2")

    covered = float((codes > 0).mean() * 100)
    log(f"regions cover {covered:.1f}% of the AOI")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(codes, mode="L").save(OUT_DIR / "regions.png", optimize=True)
    kb = (OUT_DIR / "regions.png").stat().st_size / 1024
    log(f"wrote public/data/regions/regions.png ({kb:.0f} KB)")

    write_json(OUT_DIR / "meta.json", {
        "provenance": "DERIVED",
        "derived_from": {
            "product_name": "MSL rover traverse and waypoints",
            "source_url": "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json",
            "provenance": "REAL",
        },
        "informed_by": "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/",
        "method": (
            f"For each unit, every DEM cell within {CORRIDOR_M:.0f} m of a surveyed rover waypoint "
            "inside that unit's sol window. Painted in listed order, so a later campaign wins on "
            "ground the rover revisited."
        ),
        "caveat": (
            "This is the ground Curiosity covered while working each unit, NOT a geological contact. "
            "Real unit boundaries extend far beyond any rover track. The sol windows are approximate, "
            "taken from the mission record, and are listed here so they can be checked or changed. "
            "Traced from the traverse rather than from the NASA annotated figure because that figure "
            "publishes no georeferencing control points."
        ),
        "corridor_m": CORRIDOR_M,
        "bounds": b,
        "grid": {"width": W, "height": H},
        "encoding": "8-bit PNG; pixel value = region code, 0 = outside every corridor",
        "coverage_percent": round(covered, 1),
        "regions": summary,
        "credit": "Derived by MARSWALK from NASA/JPL-Caltech rover localisation data",
        "generated": "2026-11-14",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
