"""Download Curiosity's real driven traverse and clip it to the AOI.

PROVENANCE: REAL. Source is NASA's MMGIS layer set for MSL - the same data
behind the public "Where is Curiosity?" map. Each waypoint carries the rover
motion counter, site/drive, sol, and a surveyed position.

Outputs
  public/data/traverse/waypoints.geojson   points, clipped to the AOI
  public/data/traverse/path.geojson        the driven line, clipped to the AOI
  public/data/traverse/meta.json
"""
from __future__ import annotations

import json
import sys

from common import PUBLIC_DATA, http_get, load_sources, log, write_json

OUT_DIR = PUBLIC_DATA / "traverse"

# 6 decimal degrees is ~0.1 m on Mars - well under the rover's own position
# uncertainty, and it cuts the file size by roughly an order of magnitude.
DP = 6
# Douglas-Peucker tolerance in degrees (~1 m).
SIMPLIFY_DEG = 1.7e-5


def inside(lon, lat, b):
    return b["west"] <= lon <= b["east"] and b["south"] <= lat <= b["north"]


def rnd(c):
    return [round(c[0], DP), round(c[1], DP)]


def rdp(points, eps):
    """Douglas-Peucker, iterative so long drives cannot blow the stack."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        x0, y0 = points[i0]
        x1, y1 = points[i1]
        dx, dy = x1 - x0, y1 - y0
        denom = dx * dx + dy * dy
        best_i, best_d = -1, 0.0
        for i in range(i0 + 1, i1):
            x, y = points[i]
            if denom == 0:
                d = ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
            else:
                t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / denom))
                px, py = x0 + t * dx, y0 + t * dy
                d = ((x - px) ** 2 + (y - py) ** 2) ** 0.5
            if d > best_d:
                best_i, best_d = i, d
        if best_d > eps:
            keep[best_i] = True
            stack.append((i0, best_i))
            stack.append((best_i, i1))
    return [p for p, k in zip(points, keep) if k]


def main() -> int:
    src = load_sources()
    tv = src["traverse"]

    dem_meta_path = PUBLIC_DATA / "dem" / "meta.json"
    if not dem_meta_path.exists():
        log("FATAL: run fetch_dem.py first")
        return 1
    b = json.loads(dem_meta_path.read_text(encoding="utf-8"))["bounds"]
    log(f"AOI: lon {b['west']:.5f}..{b['east']:.5f}  lat {b['south']:.5f}..{b['north']:.5f}")

    # --- waypoints -----------------------------------------------------------
    log(f"  fetching {tv['waypoints_url']}")
    wp = http_get(tv["waypoints_url"]).json()
    feats = wp.get("features", [])
    log(f"  {len(feats)} waypoints total")

    kept = []
    sols = []
    for f in feats:
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][0], g["coordinates"][1]
        if not inside(lon, lat, b):
            continue
        p = f.get("properties", {})
        sol = p.get("sol")
        if isinstance(sol, (int, float)):
            sols.append(sol)
        kept.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": rnd([lon, lat])},
            "properties": {
                "sol": sol,
                "site": p.get("site"),
                "drive": p.get("drive"),
                "rmc": p.get("RMC"),
                "elev_m": p.get("elev_geoid"),
                "tilt_deg": p.get("tilt"),
                "yaw_deg": p.get("yaw"),
            },
        })
    log(f"  {len(kept)} waypoints inside the AOI"
        + (f", sols {min(sols)}-{max(sols)}" if sols else ""))

    write_json(OUT_DIR / "waypoints.geojson", {
        "type": "FeatureCollection",
        "name": "Curiosity waypoints (AOI)",
        "features": kept,
    })

    # --- driven path ---------------------------------------------------------
    log(f"  fetching {tv['traverse_url']}")
    tr = http_get(tv["traverse_url"]).json()
    segs = []
    pts_total = 0
    for f in tr.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") == "LineString":
            lines = [g["coordinates"]]
        elif g.get("type") == "MultiLineString":
            lines = g["coordinates"]
        else:
            continue
        for line in lines:
            run = []
            for c in line:
                pts_total += 1
                if inside(c[0], c[1], b):
                    run.append([c[0], c[1]])
                elif len(run) > 1:
                    segs.append(run)
                    run = []
                else:
                    run = []
            if len(run) > 1:
                segs.append(run)

    raw_vertices = sum(len(s_) for s_ in segs)
    segs = [[rnd(c) for c in rdp(s_, SIMPLIFY_DEG)] for s_ in segs]
    segs = [s_ for s_ in segs if len(s_) > 1]
    kept_vertices = sum(len(s_) for s_ in segs)
    log(f"  driven path: {pts_total} vertices total, {len(segs)} segments inside the AOI")
    log(f"  simplified {raw_vertices} -> {kept_vertices} vertices "
        f"(Douglas-Peucker, ~1 m tolerance)")
    write_json(OUT_DIR / "path.geojson", {
        "type": "FeatureCollection",
        "name": "Curiosity driven path (AOI)",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "MultiLineString", "coordinates": segs},
            "properties": {"segments": len(segs)},
        }],
    })

    write_json(OUT_DIR / "meta.json", {
        "provenance": "REAL",
        "product_name": tv["product_name"],
        "title": tv["title"],
        "mission": tv["mission"],
        "instrument": "Rover localisation (visual odometry + orbital tie-points)",
        "source_urls": [tv["waypoints_url"], tv["traverse_url"]],
        "credit": tv["credit"],
        "bounds": b,
        "waypoints_in_aoi": len(kept),
        "sol_range": [min(sols), max(sols)] if sols else None,
        "path_segments": len(segs),
        "path_vertices": kept_vertices,
        "simplification": "Douglas-Peucker at ~1 m; coordinates rounded to 6 dp (~0.1 m)",
        "note": ("Clipped to the AOI. This is the path Curiosity actually drove, "
                 "not a plan - it is shown so a proposed EVA route can be compared "
                 "against ground truth."),
        "retrieved": "2026-11-14",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
