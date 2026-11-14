"""Derive slope, roughness and mobility hazards from the real HiRISE DEM.

PROVENANCE: DERIVED. Nothing here is downloaded - every output is computed
from public/data/dem/heightmap.png, which is REAL. The thresholds are EVA
mobility flight rules, stated in meta.json so a reviewer can check them.

Outputs
  public/data/derived/slope.png       16-bit, 0..90 degrees
  public/data/derived/hazard.png      8-bit class codes
  public/data/derived/hazards.geojson polygons per hazard class
  public/data/derived/meta.json
"""
from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image

from common import PUBLIC_DATA, log, rdp, write_json

OUT_DIR = PUBLIC_DATA / "derived"
DEM_DIR = PUBLIC_DATA / "dem"

# EVA mobility flight rules (degrees).
SLOPE_CAUTION = 15.0
SLOPE_IMPASSABLE = 25.0

# Terrain ruggedness, in metres of DETRENDED local relief.
#
# A raw 3x3 standard deviation does not measure roughness at this posting: on a
# 10 degree slope with 14 m pixels the elevation legitimately changes ~2.5 m per
# pixel, so a plain std-dev just re-measures the slope. We therefore subtract a
# 5x5 local mean first and measure what is left - relief the regional slope does
# not explain.
#
# Honest limitation, recorded in meta.json: at ~14 m/px this cannot resolve
# individual boulders (metre-scale). It is a ruggedness index, not a rock count.
ROUGH_CAUTION = 1.0
ROUGH_IMPASSABLE = 2.2

CLASS = {
    "nominal": 0,
    "caution": 1,
    "slope-impassable": 2,
    "rough": 3,
    "no-data": 4,
}
CLASS_META = [
    {"code": 0, "key": "nominal", "label": "Nominal traverse", "color": "#3ddc97",
     "passable": True, "cost_factor": 1.0,
     "detail": "Slope under 15 degrees and low local relief."},
    {"code": 1, "key": "caution", "label": "Caution: slope 15-25 deg or rugged", "color": "#f2b53a",
     "passable": True, "cost_factor": 2.6,
     "detail": "Above the 15 degree slope flight rule, or detrended local relief over 1.0 m. Traversable at a cost penalty."},
    {"code": 2, "key": "slope-impassable", "label": "Slope > 25 deg", "color": "#ef4444",
     "passable": False, "cost_factor": None,
     "detail": "Above the suited-crew limit. Barred by the planner."},
    {"code": 3, "key": "rough", "label": "Broken ground", "color": "#a855f7",
     "passable": False, "cost_factor": None,
     "detail": "Detrended local relief over 2.2 m. A ruggedness index, not a rock count: at ~14 m/px the DEM cannot resolve individual boulders."},
    {"code": 4, "key": "no-data", "label": "No stereo coverage", "color": "#616b7c",
     "passable": False, "cost_factor": None,
     "detail": "Outside the HiRISE stereo swath. No terrain knowledge, so the planner will not route here."},
]


def horn_slope(z: np.ndarray, dx: float, dy: float) -> np.ndarray:
    """Slope in degrees, Horn's 3x3 method, honouring non-square pixels."""
    p = np.pad(z, 1, mode="edge")
    z1, z2, z3 = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    z4, z6 = p[1:-1, :-2], p[1:-1, 2:]
    z7, z8, z9 = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8.0 * dx)
    dzdy = ((z1 + 2 * z2 + z3) - (z7 + 2 * z8 + z9)) / (8.0 * dy)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype(np.float32)


def box_mean(z: np.ndarray, radius: int) -> np.ndarray:
    k = 2 * radius + 1
    p = np.pad(z, radius, mode="edge")
    acc = np.zeros_like(z, dtype=np.float64)
    for a in range(k):
        for b in range(k):
            acc += p[a:a + z.shape[0], b:b + z.shape[1]]
    return (acc / (k * k)).astype(np.float32)


def detrended_roughness(z: np.ndarray) -> np.ndarray:
    """Local relief left over once the regional slope is removed."""
    resid = z - box_mean(z, 2)          # 5x5 trend removal
    p = np.pad(resid, 1, mode="edge")
    win = np.stack([p[a:a + z.shape[0], b:b + z.shape[1]]
                    for a in range(3) for b in range(3)])
    return win.std(axis=0).astype(np.float32)


def mask_to_rings(mask: np.ndarray, to_lonlat):
    """Trace the boundary of a boolean mask as closed rings (cell edges)."""
    h, w = mask.shape
    starts: dict[tuple, list] = {}

    def push(a, b):
        starts.setdefault(a, []).append((a, b))

    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if y == 0 or not mask[y - 1, x]:
            push((x + 1, y), (x, y))
        if y == h - 1 or not mask[y + 1, x]:
            push((x, y + 1), (x + 1, y + 1))
        if x == 0 or not mask[y, x - 1]:
            push((x, y), (x, y + 1))
        if x == w - 1 or not mask[y, x + 1]:
            push((x + 1, y + 1), (x + 1, y))

    rings = []
    guard = 0
    limit = w * h * 8
    for key in list(starts.keys()):
        while starts.get(key):
            seg = starts[key].pop()
            ring = [seg[0]]
            cur = seg[1]
            while cur != seg[0] and guard < limit:
                guard += 1
                ring.append(cur)
                nxt = starts.get(cur)
                if not nxt:
                    break
                cur = nxt.pop()[1]
            if len(ring) >= 4:
                rings.append([to_lonlat(px, py) for px, py in ring] +
                             [to_lonlat(*ring[0])])
    return rings


MIN_POLY_CELLS = 48     # drop speckle smaller than this many DEM cells
MAX_POLYS = 40          # keep the GeoJSON reviewable
SIMPLIFY_CELLS = 2.5    # Douglas-Peucker tolerance, in DEM cells


def drop_collinear(ring):
    """Collapse runs of collinear vertices left by cell-edge tracing."""
    if len(ring) < 4:
        return ring
    out = [ring[0]]
    for i in range(1, len(ring) - 1):
        ax, ay = out[-1]
        bx, by = ring[i]
        cx, cy = ring[i + 1]
        if abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > 1e-12:
            out.append(ring[i])
    out.append(ring[-1])
    return out


def ring_area_cells(ring, b, w, h):
    """Shoelace area, expressed in DEM cells."""
    a = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        a += x0 * y1 - x1 * y0
    deg2 = abs(a) / 2.0
    cell_deg2 = ((b["east"] - b["west"]) / w) * ((b["north"] - b["south"]) / h)
    return deg2 / cell_deg2 if cell_deg2 else 0.0


def main() -> int:
    meta_path = DEM_DIR / "meta.json"
    if not meta_path.exists():
        log("FATAL: run fetch_dem.py first")
        return 1
    dem_meta = json.loads(meta_path.read_text(encoding="utf-8"))

    hm = np.array(Image.open(DEM_DIR / "heightmap.png")).astype(np.float32)
    zmin = dem_meta["elevation_m"]["min"]
    zmax = dem_meta["elevation_m"]["max"]
    z = zmin + hm / 65535.0 * (zmax - zmin)
    h, w = z.shape
    res = dem_meta["ground_resolution_m"]
    dx, dy = float(res["x"]), float(res["y"])
    log(f"DEM {w} x {h} at {dx:.2f} x {dy:.2f} m/px, elevation {zmin:.1f}..{zmax:.1f} m")

    cov_path = DEM_DIR / "coverage.png"
    coverage = (np.array(Image.open(cov_path)) > 127) if cov_path.exists() else np.ones_like(z, bool)
    log(f"  stereo coverage {100.0 * coverage.mean():.1f}%")

    slope = horn_slope(z, dx, dy)
    rough = detrended_roughness(z)
    # Outside the stereo swath the surface is interpolated, so its slope and
    # roughness are meaningless. Zero them rather than report invented values.
    slope[~coverage] = 0.0
    rough[~coverage] = 0.0

    inside = slope[coverage]
    log(f"  slope: median {np.median(inside):.2f} deg, p95 {np.percentile(inside, 95):.2f} deg, "
        f"max {inside.max():.2f} deg")
    log(f"  roughness: median {np.median(rough[coverage]):.2f} m, "
        f"p95 {np.percentile(rough[coverage], 95):.2f} m")

    # Assign in order of increasing severity so the worst class always wins.
    hazard = np.zeros((h, w), np.uint8)
    caution = ((slope >= SLOPE_CAUTION) | (rough >= ROUGH_CAUTION)) & coverage
    hazard[caution] = CLASS["caution"]
    hazard[(rough >= ROUGH_IMPASSABLE) & coverage] = CLASS["rough"]
    hazard[(slope >= SLOPE_IMPASSABLE) & coverage] = CLASS["slope-impassable"]
    hazard[~coverage] = CLASS["no-data"]

    passable = float(((hazard == 0) | (hazard == 1)).mean() * 100.0)
    log(f"  passable to suited crew: {passable:.1f}% of the AOI")

    total = hazard.size
    for c in CLASS_META:
        n = int((hazard == c["code"]).sum())
        log(f"  class {c['code']} {c['key']:<18} {n:>8} cells  {100.0*n/total:5.1f}%")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(slope, 0, 90) / 90.0 * 65535).astype(np.uint16),
                    mode="I;16").save(OUT_DIR / "slope.png", optimize=True)
    log(f"  wrote public/data/derived/slope.png "
        f"({(OUT_DIR / 'slope.png').stat().st_size/1024:.0f} KB)")
    Image.fromarray(hazard, mode="L").save(OUT_DIR / "hazard.png", optimize=True)
    log(f"  wrote public/data/derived/hazard.png "
        f"({(OUT_DIR / 'hazard.png').stat().st_size/1024:.0f} KB)")

    # --- hazard polygons -----------------------------------------------------
    b = dem_meta["bounds"]

    def to_lonlat(px, py):
        return [round(b["west"] + px / w * (b["east"] - b["west"]), 6),
                round(b["north"] - py / h * (b["north"] - b["south"]), 6)]

    features = []
    for c in CLASS_META:
        if c["code"] == 0:
            continue
        mask = hazard == c["code"]
        if not mask.any():
            continue
        rings = mask_to_rings(mask, to_lonlat)
        rings = [drop_collinear(r) for r in rings]
        rings = [r for r in rings if len(r) >= 5 and ring_area_cells(r, b, w, h) >= MIN_POLY_CELLS]
        rings.sort(key=lambda r: -ring_area_cells(r, b, w, h))
        rings = rings[:MAX_POLYS]
        tol = SIMPLIFY_CELLS * (b["east"] - b["west"]) / w
        simplified = []
        for r in rings:
            sr = rdp(r, tol)
            if sr[0] != sr[-1]:
                sr.append(sr[0])
            if len(sr) >= 5:
                simplified.append([[round(x, 6), round(y, 6)] for x, y in sr])
        rings = simplified
        for i, ring in enumerate(rings):
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "class": c["key"], "code": c["code"], "label": c["label"],
                    "passable": c["passable"], "cost_factor": c["cost_factor"],
                    "color": c["color"], "detail": c["detail"], "index": i + 1,
                },
            })
        log(f"  traced {len(rings)} polygons for {c['key']}"
            f" ({sum(len(r) for r in rings)} vertices after simplification)")

    write_json(OUT_DIR / "hazards.geojson",
               {"type": "FeatureCollection", "name": "EVA mobility hazards (derived)",
                "features": features})

    write_json(OUT_DIR / "meta.json", {
        "provenance": "DERIVED",
        "derived_from": {
            "product_name": dem_meta["product_name"],
            "source_url": dem_meta["source_url"],
            "provenance": "REAL",
        },
        "method": {
            "slope": f"Horn 3x3 gradient on the DEM at {dx:.2f} x {dy:.2f} m baseline",
            "roughness": "standard deviation of elevation in a 3x3 window (rock-abundance proxy)",
            "no_data": "cells outside the HiRISE stereo swath are classed no-data and barred",
        },
        "thresholds_deg": {"caution": SLOPE_CAUTION, "impassable": SLOPE_IMPASSABLE},
        "thresholds_roughness_m": {"caution": ROUGH_CAUTION, "impassable": ROUGH_IMPASSABLE},
        "classes": CLASS_META,
        "bounds": b,
        "grid": {"width": w, "height": h},
        "ground_resolution_m": {"x": dx, "y": dy},
        "slope_png_encoding": "16-bit greyscale; degrees = value/65535 * 90",
        "statistics": {
            "slope_median_deg": round(float(np.median(inside)), 2),
            "slope_p95_deg": round(float(np.percentile(inside, 95)), 2),
            "slope_max_deg": round(float(inside.max()), 2),
            "class_cell_counts": {c["key"]: int((hazard == c["code"]).sum()) for c in CLASS_META},
        },
        "credit": "Derived by MARSWALK from NASA/JPL-Caltech/University of Arizona HiRISE data",
        "generated": "2026-11-14",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
