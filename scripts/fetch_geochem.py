"""Build the AOI geochemistry grids from real CRISM summary-parameter cubes.

PROVENANCE: REAL. The source is the published MTRDR summary-parameter cube from
the MRO CRISM archive at the PDS Geosciences Node: 32-bit float spectral
indices, one band per parameter, already atmospherically and photometrically
corrected by the instrument team. We compute no spectroscopy of our own - we
resample what the archive publishes onto the AOI grid.

Two scenes are used. The full-resolution FRT observation at 18 m/px covers the
AOI across its whole width but falls short at both ends in latitude; the
half-resolution HRL observation at 36 m/px contains the whole AOI and fills
what the FRT scene misses. Which scene supplied each cell is written into
coverage.png, because 36 m/px is not the same claim as 18 m/px.

We never download a whole cube. A BAND_SEQUENTIAL plane is contiguous, so one
HTTP range request fetches one complete summary parameter: 2.2 MB out of a
139 MB file. Nine parameters from two scenes is about 28 MB in 18 requests.

Outputs
  public/data/geochem/<key>.png   8-bit index rasters, one per parameter
  public/data/geochem/coverage.png 0 = none, 1 = FRT 18 m/px, 2 = HRL 36 m/px
  public/data/geochem/meta.json   bounds, scaling, statistics, provenance
"""
from __future__ import annotations

import concurrent.futures as cf
import sys

import numpy as np
from PIL import Image

from common import (
    MARS_RADIUS_M,
    PUBLIC_DATA,
    PdsLabel,
    ensure_dirs,
    http_get,
    http_range,
    load_sources,
    log,
    write_json,
)
from envi import EnviHeader

OUT_DIR = PUBLIC_DATA / "geochem"
DEM_DIR = PUBLIC_DATA / "dem"
WORKERS = 6

# Per-cell coverage codes, written to coverage.png.
COV_NONE = 0
COV_PRIMARY = 1
COV_GAPFILL = 2

# Georeferencing agreement we require between the ENVI header's map info and
# the PDS label's corner keywords, once both are expressed edge-to-edge.
#
# Set between the two error sizes that matter. The label prints its corners and
# its MAP_RESOLUTION to seven figures, and that rounding alone moves a
# reconstructed edge by around 0.1 m. The smallest mistake worth catching is a
# convention or offset error, which lands at half a source pixel, 9 m. So 0.6 m
# sits an order of magnitude clear of both: it is a twenty-fourth of one 14.3 m
# output cell, far too small to shift the grid, and six times the print noise.
GEOREF_TOLERANCE_DEG = 1e-5


class Scene:
    """One CRISM summary cube, read through its header and its label."""

    def __init__(self, spec: dict):
        self.spec = spec
        self.role = spec["role"]
        self.product_id = spec["product_id"]
        self.img = spec["img"]

        self.hdr = EnviHeader(http_get(spec["hdr"]).text)
        self.lbl = PdsLabel(http_get(spec["lbl"]).text)

        if self.hdr.interleave != "bsq":
            raise RuntimeError(f"{self.product_id}: expected BSQ, got {self.hdr.interleave}")
        if self.hdr.dtype != "<f4":
            raise RuntimeError(f"{self.product_id}: expected 32-bit LE float, got {self.hdr.dtype}")

        self.bounds = self.hdr.bounds(MARS_RADIUS_M)
        self.scale_m = self.bounds["scale_m"]

    # --- the two georeferencing paths have to agree -------------------------
    def check_georef(self) -> list[str]:
        """Compare the ENVI map info against the PDS label's corner keywords.

        These are written by different parts of the pipeline that produced the
        product. If they disagree, we do not know where the data is, and the
        right move is to stop rather than to resample it onto the AOI anyway.

        The two use different conventions, and that has to be undone before
        they can be compared. The PDS label's corner keywords are the longitude
        and latitude of the *centres* of the corner pixels; the ENVI map info
        tie point is the outer *corner* of pixel (1,1). So the label's extent is
        half a pixel short on each of the four sides. On these cubes that is 9 m
        out of an 18 m pixel, which is exactly the offset observed. Everything
        downstream uses the edge convention, matching the DEM's own bounds.
        """
        problems = []

        # Half a pixel in degrees, from the label's own px-per-degree figure, so
        # the two sides of the comparison stay independent of each other.
        map_resolution = self.lbl.num("MAP_RESOLUTION")
        if not map_resolution:
            return ["label has no MAP_RESOLUTION, so its corner convention "
                    "cannot be converted to edges"]
        half = 0.5 / map_resolution

        label_edges = {
            "west": (self.lbl.num("WESTERNMOST_LONGITUDE"), -half),
            "east": (self.lbl.num("EASTERNMOST_LONGITUDE"), +half),
            "south": (self.lbl.num("MINIMUM_LATITUDE"), -half),
            "north": (self.lbl.num("MAXIMUM_LATITUDE"), +half),
        }
        for edge, (centre, shift) in label_edges.items():
            if centre is None:
                problems.append(f"label has no {edge} corner keyword")
                continue
            delta = abs((centre + shift) - self.bounds[edge])
            if delta > GEOREF_TOLERANCE_DEG:
                problems.append(
                    f"{edge}: ENVI map info says {self.bounds[edge]:.7f} deg, "
                    f"PDS label says {centre + shift:.7f} deg edge-to-edge "
                    f"({delta * 59281:.2f} m apart)"
                )

        # The pixel size implied by each path, independently of where it sits.
        envi_dpp = (self.bounds["east"] - self.bounds["west"]) / self.hdr.samples
        if abs(envi_dpp - 1.0 / map_resolution) / envi_dpp > 1e-4:
            problems.append(
                f"pixel size: ENVI map info gives {envi_dpp:.3e} deg/px, "
                f"MAP_RESOLUTION gives {1.0 / map_resolution:.3e} deg/px"
            )

        if self.lbl.integer("LINE_SAMPLES") != self.hdr.samples:
            problems.append("LINE_SAMPLES and ENVI samples disagree")
        if self.lbl.integer("LINES") != self.hdr.lines:
            problems.append("LINES and ENVI lines disagree")
        if self.lbl.integer("BANDS") != self.hdr.bands:
            problems.append("BANDS and ENVI bands disagree")

        map_scale_km = self.lbl.num("MAP_SCALE")
        if map_scale_km is not None:
            label_m = map_scale_km * 1000.0
            if abs(label_m - self.scale_m) > 0.5:
                problems.append(
                    f"MAP_SCALE says {label_m:.1f} m/px, ENVI map info says {self.scale_m:.1f}"
                )
        return problems

    def read_band(self, name: str) -> np.ndarray:
        """One whole summary parameter, as (lines, samples) float32 with NaN gaps."""
        band0 = self.hdr.band_index(name)
        a, b = self.hdr.band_byte_range(band0)
        raw = http_range(self.img, a, b)
        need = self.hdr.samples * self.hdr.lines
        arr = np.frombuffer(raw, dtype=self.hdr.dtype)
        if arr.size != need:
            raise RuntimeError(
                f"{self.product_id} band {name}: got {arr.size} samples, expected {need}"
            )
        vals = arr.astype(np.float32).reshape(self.hdr.lines, self.hdr.samples).copy()
        # The sentinel lives in the ENVI header and nowhere else in the product.
        if self.hdr.ignore is not None:
            vals[vals == np.float32(self.hdr.ignore)] = np.nan
        # CRISM indices are small signed numbers; anything of sentinel magnitude
        # that survived the exact comparison is not a measurement either.
        vals[~np.isfinite(vals)] = np.nan
        vals[np.abs(vals) > 1e4] = np.nan
        return vals

    def sample_to_grid(self, band: np.ndarray, dem_bounds: dict, w: int, h: int):
        """Nearest-neighbour resample onto the AOI grid. Returns (values, inside).

        Nearest, not bilinear: 18 m/px onto 14.29 m/px is an upsample, and
        interpolating would put values between cells that the instrument never
        measured. `inside` marks the output cells this scene actually covers.
        """
        b, sb = dem_bounds, self.bounds
        lon = b["west"] + (np.arange(w) + 0.5) / w * (b["east"] - b["west"])
        lat = b["north"] - (np.arange(h) + 0.5) / h * (b["north"] - b["south"])

        sx = (lon - sb["west"]) / (sb["east"] - sb["west"]) * self.hdr.samples
        sy = (sb["north"] - lat) / (sb["north"] - sb["south"]) * self.hdr.lines
        ix = np.floor(sx).astype(np.int64)
        iy = np.floor(sy).astype(np.int64)

        okx = (ix >= 0) & (ix < self.hdr.samples)
        oky = (iy >= 0) & (iy < self.hdr.lines)
        inside = oky[:, None] & okx[None, :]

        out = np.full((h, w), np.nan, dtype=np.float32)
        if inside.any():
            gy, gx = np.nonzero(inside)
            out[gy, gx] = band[iy[gy], ix[gx]]
        # A cell inside the footprint but with no valid value is still a gap.
        return out, inside & np.isfinite(out)


def main() -> int:
    src = load_sources()
    geo = src["geochem"]

    dem_meta_path = DEM_DIR / "meta.json"
    if not dem_meta_path.exists():
        log("FATAL: run fetch_dem.py first - the geochem grid is aligned to the DEM's")
        return 1
    import json

    dem_meta = json.loads(dem_meta_path.read_text(encoding="utf-8"))
    b = dem_meta["bounds"]
    W = int(dem_meta["grid"]["width"])
    H = int(dem_meta["grid"]["height"])
    res = dem_meta["ground_resolution_m"]
    dx, dy = float(res["x"]), float(res["y"])
    log(f"AOI grid from the DEM: {W} x {H} at {dx:.2f} x {dy:.2f} m/px")
    log(f"  lon {b['west']:.5f}..{b['east']:.5f}  lat {b['south']:.5f}..{b['north']:.5f}")

    # --- open both scenes and check them before reading any pixels ----------
    scenes: list[Scene] = []
    for spec in geo["scenes"]:
        log(f"\n{spec['role']}: {spec['product_id']}")
        log(f"  {spec['img']}")
        sc = Scene(spec)
        log(f"  cube {sc.hdr.samples} x {sc.hdr.lines} x {sc.hdr.bands} bands, "
            f"{sc.hdr.dtype} {sc.hdr.interleave.upper()}, no-data {sc.hdr.ignore}")
        log(f"  map scale {sc.scale_m:.1f} m/px")
        log(f"  footprint lon {sc.bounds['west']:.5f}..{sc.bounds['east']:.5f}  "
            f"lat {sc.bounds['south']:.5f}..{sc.bounds['north']:.5f}")

        problems = sc.check_georef()
        if problems:
            log("  FATAL: the ENVI header and the PDS label do not agree:")
            for p in problems:
                log(f"    - {p}")
            log("  Refusing to resample a product whose position is uncertain.")
            return 1
        log("  georeferencing self-consistent: ENVI map info agrees with the PDS "
            "label to under 1 m once the label's pixel-centre corners are "
            f"converted to edges (half a pixel, {sc.scale_m / 2:.0f} m)")

        if abs(sc.scale_m - float(spec["map_scale_m"])) > 0.5:
            log(f"  FATAL: sources.json claims {spec['map_scale_m']} m/px, "
                f"the product says {sc.scale_m:.1f}")
            return 1

        # The AOI and the product must share a projection or a resample is
        # meaningless. Both are EQUIRECTANGULAR on the same sphere as our DEM.
        proj = sc.lbl.raw("MAP_PROJECTION_TYPE", "").strip('" ')
        radius_km = sc.lbl.num("A_AXIS_RADIUS")
        if proj != "EQUIRECTANGULAR":
            log(f"  FATAL: projection is {proj!r}, not EQUIRECTANGULAR; "
                "this pipeline does not reproject")
            return 1
        if radius_km is None or abs(radius_km * 1000.0 - MARS_RADIUS_M) > 1.0:
            log(f"  FATAL: A_AXIS_RADIUS {radius_km} km does not match the DEM's "
                f"{MARS_RADIUS_M / 1000.0} km")
            return 1
        log(f"  {proj} on a {radius_km} km sphere - same frame as the DEM, no reprojection")

        missing = [x["name"] for x in geo["bands"] if x["name"] not in sc.hdr.band_names]
        if missing:
            log(f"  FATAL: cube does not carry {', '.join(missing)}")
            return 1
        scenes.append(sc)

    if scenes[0].scale_m > scenes[1].scale_m:
        log("FATAL: sources.json lists the coarser scene as primary")
        return 1

    # --- which scene supplies each output cell -------------------------------
    #
    # Decided once, from footprints, so every parameter is drawn from the same
    # scene in the same place. A cell the primary scene covers is never taken
    # from the coarser one, even where the primary has a gap in that band.
    # Every parameter is read first, so the probe below costs no extra request.
    log(f"\nreading {len(geo['bands'])} parameters from {len(scenes)} scenes "
        f"by HTTP range ({WORKERS} workers)...")

    jobs = [(si, spec) for si in range(len(scenes)) for spec in geo["bands"]]

    def read(job):
        si, spec = job
        return si, spec["name"], scenes[si].read_band(spec["name"])

    planes: dict[tuple[int, str], np.ndarray] = {}
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for si, name, arr in ex.map(read, jobs):
            planes[(si, name)] = arr
            log(f"    {scenes[si].role:<9} {name:<10} "
                f"{100.0 * np.isfinite(arr).mean():5.1f}% valid in the cube")

    log("")
    probe = geo["bands"][0]["name"]
    inside = []
    for si, sc in enumerate(scenes):
        _, ok = sc.sample_to_grid(planes[(si, probe)], b, W, H)
        inside.append(ok)
        log(f"  {sc.role:<9} {sc.product_id} covers {100.0 * ok.mean():5.1f}% of the AOI")

    coverage = np.full((H, W), COV_NONE, dtype=np.uint8)
    coverage[inside[1]] = COV_GAPFILL
    coverage[inside[0]] = COV_PRIMARY
    pct_any = 100.0 * (coverage != COV_NONE).mean()
    pct_primary = 100.0 * (coverage == COV_PRIMARY).mean()
    pct_gapfill = 100.0 * (coverage == COV_GAPFILL).mean()
    log(f"  combined coverage {pct_any:.1f}% "
        f"({pct_primary:.1f}% at {scenes[0].scale_m:.0f} m/px, "
        f"{pct_gapfill:.1f}% at {scenes[1].scale_m:.0f} m/px, "
        f"{100.0 - pct_any:.1f}% none)")
    if pct_any < 60.0:
        log("FATAL: less than 60% of the AOI has CRISM coverage; pick other scenes")
        return 1

    # --- merge, resample, quantise, write ------------------------------------
    ensure_dirs(OUT_DIR)
    band_meta = []
    for spec in geo["bands"]:
        name, key = spec["name"], spec["key"]
        merged = np.full((H, W), np.nan, dtype=np.float32)
        for si, code in ((1, COV_GAPFILL), (0, COV_PRIMARY)):
            vals, _ = scenes[si].sample_to_grid(planes[(si, name)], b, W, H)
            take = (coverage == code) & np.isfinite(vals)
            merged[take] = vals[take]

        valid = np.isfinite(merged)
        n = int(valid.sum())
        if n == 0:
            log(f"FATAL: {name} came back empty over the AOI")
            return 1
        v = merged[valid]

        # 8-bit, with the scale clipped at the bottom only.
        #
        # Getting this right took two attempts and the reason is worth keeping.
        # A mineral index sits near zero across most of the AOI and carries its
        # detections in the top one per cent, with a long negative tail that
        # only means "this absorption is absent". Stretching a byte over
        # p1..p99 clips the detections off, which is fatal. Stretching it over
        # the true min..max spends most of the range on that negative tail and
        # leaves about ten levels across everything that matters. Clipping the
        # bottom percentile and keeping the maximum spends the byte where the
        # information is: the step lands near a twentieth of the weakest
        # absorption worth believing, and no detection is lost. Only the lowest
        # one per cent of cells is flattened, and those are cells where the
        # absorption is absent either way.
        lo = float(np.percentile(v, 1))
        hi = float(v.max())
        if hi - lo < 1e-9:
            hi = lo + 1e-9
        q = np.zeros((H, W), dtype=np.uint8)
        q[valid] = (1 + np.clip((v - lo) / (hi - lo), 0.0, 1.0) * 254.0).round().astype(np.uint8)
        Image.fromarray(q, mode="L").save(OUT_DIR / f"{key}.png", optimize=True)
        kb = (OUT_DIR / f"{key}.png").stat().st_size / 1024

        band_meta.append({
            **{k: spec[k] for k in ("name", "key", "shows", "mineralogy")},
            "file": f"{key}.png",
            "encoding": ("8-bit PNG. 0 = no CRISM value. 1..255 linear over "
                         "scale_min..scale_max, so index = scale_min + (v - 1) / 254 "
                         "* (scale_max - scale_min)."),
            "scale_min": round(lo, 8),
            "scale_max": round(hi, 8),
            "scale_note": ("scale_min is the 1st percentile, not the minimum: the lowest "
                           "one per cent of cells render at level 1. scale_max is the true "
                           "maximum, so no detection is clipped."),
            "quantisation_step": float(f"{(hi - lo) / 254.0:.3g}"),
            "valid_cells": n,
            "statistics": {
                "min": round(float(v.min()), 6),
                "max": round(float(v.max()), 6),
                "median": round(float(np.median(v)), 6),
                "p90": round(float(np.percentile(v, 90)), 6),
                "p99": round(float(np.percentile(v, 99)), 6),
                "p99_9": round(float(np.percentile(v, 99.9)), 6),
            },
        })
        log(f"  {name:<10} -> {key}.png ({kb:5.1f} KB)  "
            f"median {np.median(v):+.4f}  p99 {np.percentile(v, 99):+.4f}  "
            f"range {v.min():+.4f}..{v.max():+.4f}  step {(hi - lo) / 254.0:.1e}")

    Image.fromarray(coverage, mode="L").save(OUT_DIR / "coverage.png", optimize=True)
    log(f"  coverage.png ({(OUT_DIR / 'coverage.png').stat().st_size / 1024:.1f} KB)")

    write_json(OUT_DIR / "meta.json", {
        "provenance": "REAL",
        "title": geo["title"],
        "mission": geo["mission"],
        "instrument": geo["instrument"],
        "product_type": geo["product_type"],
        "archive": geo["archive"],
        "credit": geo["credit"],
        "reference": geo["reference"],
        "scenes": [{
            "role": sc.role,
            "product_id": sc.product_id,
            "source_url": sc.img,
            "map_scale_m_per_px": sc.scale_m,
            "cube": {"samples": sc.hdr.samples, "lines": sc.hdr.lines, "bands": sc.hdr.bands},
            "footprint": {k: round(sc.bounds[k], 6) for k in ("west", "south", "east", "north")},
            "aoi_cells": int((coverage == (COV_PRIMARY if i == 0 else COV_GAPFILL)).sum()),
            "note": sc.spec["note"],
        } for i, sc in enumerate(scenes)],
        "bounds": b,
        "grid": {"width": W, "height": H},
        "ground_resolution_m": {"x": dx, "y": dy},
        "aligned_to": "public/data/dem/meta.json - identical bounds and grid",
        "resample": (
            f"Nearest neighbour from {scenes[0].scale_m:.0f} m/px (primary) and "
            f"{scenes[1].scale_m:.0f} m/px (gap-fill) onto {dx:.2f} m cells. This is an "
            "upsample, so the geochemistry is blockier than the terrain under it. Nearest "
            "rather than bilinear because interpolating would place index values between "
            "cells the instrument never measured."
        ),
        "coverage_mask": {
            "file": "coverage.png",
            "encoding": "8-bit PNG; 0 = no CRISM coverage, 1 = primary scene, 2 = gap-fill scene",
            "percent_any": round(pct_any, 1),
            "percent_primary": round(pct_primary, 1),
            "percent_gapfill": round(pct_gapfill, 1),
            "percent_none": round(100.0 - pct_any, 1),
        },
        "bands": band_meta,
        "bands_note": geo["bands_note"],
        "no_data": geo["no_data"],
        "caveat": geo["caveat"],
        "mars_radius_m": MARS_RADIUS_M,
        "retrieved": geo["retrieved"],
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
