"""Build the AOI elevation grid from the real HiRISE stereo DTM.

PROVENANCE: REAL. The source is a 32-bit float PDS3 DTM product from the
HiRISE archive (University of Arizona / NASA PDS). We never download the whole
~390 MB file: the server supports HTTP range requests, so we read only the
image rows the AOI needs.

Outputs
  public/data/dem/heightmap.png   16-bit greyscale, elevation linearly scaled
  public/data/dem/meta.json       bounds, resolution, min/max, provenance
"""
from __future__ import annotations

import concurrent.futures as cf
import sys
import threading

import numpy as np
from PIL import Image

from common import (
    MARS_RADIUS_M,
    PUBLIC_DATA,
    PdsRaster,
    bbox_metres,
    fetch_pds_label,
    http_range,
    load_sources,
    log,
    write_json,
)

OUT_DIR = PUBLIC_DATA / "dem"
WORKERS = 12

# HiRISE DTM no-data value from the label: 16#FF7FFFFB#
MISSING = np.float32(np.frombuffer(bytes.fromhex("FBFF7FFF"), dtype="<f4")[0])


def main() -> int:
    src = load_sources()
    aoi = src["aoi"]
    dem_src = src["dem"]
    url = dem_src["url"]
    grid = int(aoi["grid"])

    log(f"DEM source: {dem_src['product_name']}")
    log(f"  {url}")

    label = fetch_pds_label(url)
    ras = PdsRaster(url, label)
    log(f"  raster {ras.samples} x {ras.lines} px, {ras.sample_bits}-bit {ras.sample_type}")
    log(f"  footprint lon {ras.west:.5f}..{ras.east:.5f}  lat {ras.south:.5f}..{ras.north:.5f}")
    log(f"  map scale {ras.map_scale} m/px, data starts at byte {ras.data_offset}")

    problems = ras.check()
    if problems:
        log(f"  LABEL CHECK: {problems}")
    else:
        log("  label self-consistent (file size and georeferencing agree)")

    # --- clip the requested AOI to what the product actually covers ----------
    w = max(aoi["west"], ras.west)
    e = min(aoi["east"], ras.east)
    s = max(aoi["south"], ras.south)
    n = min(aoi["north"], ras.north)
    if w >= e or s >= n:
        log("FATAL: requested AOI does not intersect the DTM footprint")
        return 1
    if (w, e, s, n) != (aoi["west"], aoi["east"], aoi["south"], aoi["north"]):
        log(f"  AOI clipped to product coverage: lon {w:.5f}..{e:.5f} lat {s:.5f}..{n:.5f}")

    s0 = int(np.floor(ras.lon_to_sample(w)))
    s1 = int(np.ceil(ras.lon_to_sample(e)))
    l0 = int(np.floor(ras.lat_to_line(n)))
    l1 = int(np.ceil(ras.lat_to_line(s)))
    s0, s1 = max(0, s0), min(ras.samples, s1)
    l0, l1 = max(0, l0), min(ras.lines, l1)
    src_w, src_h = s1 - s0, l1 - l0
    log(f"  AOI window in source pixels: x {s0}..{s1} ({src_w}), y {l0}..{l1} ({src_h})")

    width_m, height_m = bbox_metres(w, s, e, n)
    log(f"  AOI ground size: {width_m/1000:.2f} km x {height_m/1000:.2f} km")

    # Output grid keeps the AOI aspect ratio, longest side = `grid`.
    if width_m >= height_m:
        out_w = grid
        out_h = max(16, int(round(grid * height_m / width_m)))
    else:
        out_h = grid
        out_w = max(16, int(round(grid * width_m / height_m)))
    log(f"  output grid: {out_w} x {out_h} "
        f"({width_m/out_w:.2f} m/px x {height_m/out_h:.2f} m/px)")

    # --- read only the rows we need, in parallel -----------------------------
    rows = np.linspace(l0, l1 - 1, out_h).round().astype(int)
    out = np.full((out_h, out_w), np.nan, dtype=np.float32)
    cols = np.linspace(0, src_w - 1, out_w).round().astype(int)

    done = [0]
    lock = threading.Lock()

    def read_row(i_line):
        i, line = i_line
        a, b = ras.row_byte_range(int(line), s0, s1)
        raw = http_range(url, a, b)
        arr = np.frombuffer(raw[: src_w * ras.bpp], dtype=ras.dtype)
        if arr.size < src_w:
            arr = np.pad(arr, (0, src_w - arr.size), constant_values=np.nan)
        vals = arr[cols].astype(np.float32).copy()
        # mask the PDS no-data constant and anything outside the stated valid range
        bad = ~np.isfinite(vals) | (vals < -1e30)
        if ras.valid_min is not None:
            bad |= vals < ras.valid_min - 1.0
        if ras.valid_max is not None:
            bad |= vals > ras.valid_max + 1.0
        vals[bad] = np.nan
        with lock:
            out[i] = vals
            done[0] += 1
            if done[0] % 64 == 0 or done[0] == out_h:
                log(f"    rows {done[0]}/{out_h}")

    log(f"  reading {out_h} rows by HTTP range ({WORKERS} workers)...")
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(read_row, list(enumerate(rows))))

    valid = np.isfinite(out)
    pct = 100.0 * valid.sum() / out.size
    log(f"  valid samples: {valid.sum()}/{out.size} ({pct:.1f}%)")
    if pct < 50:
        log("FATAL: more than half the AOI has no DTM coverage; pick another product")
        return 1

    # --- fill gaps for rendering, but keep the mask so nothing is invented ----
    #
    # The HiRISE stereo swath is a tilted parallelogram, so the corners of an
    # axis-aligned AOI fall outside it. We fill those cells to keep the 3D mesh
    # and the hillshade continuous, and ship a coverage mask alongside so the
    # planner can bar them: you cannot route an EVA across terrain you have no
    # stereo coverage for.
    if not valid.all():
        filled = fill_nans(out)
        log(f"  filled {int((~valid).sum())} no-data cells for rendering "
            f"(flagged in coverage.png, barred by the planner)")
    else:
        filled = out

    zmin = float(np.nanmin(filled))
    zmax = float(np.nanmax(filled))
    log(f"  elevation {zmin:.2f} .. {zmax:.2f} m (areoid), relief {zmax - zmin:.1f} m")

    # --- write 16-bit heightmap PNG -----------------------------------------
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    norm = (filled - zmin) / max(1e-6, zmax - zmin)
    png = (norm * 65535.0).round().astype(np.uint16)
    Image.fromarray(png, mode="I;16").save(OUT_DIR / "heightmap.png", optimize=True)
    size_kb = (OUT_DIR / "heightmap.png").stat().st_size / 1024
    log(f"  wrote public/data/dem/heightmap.png ({size_kb:.0f} KB, 16-bit)")

    # --- coverage mask: 255 where the DTM really has data, 0 where it does not
    cov = (valid * 255).astype(np.uint8)
    Image.fromarray(cov, mode="L").save(OUT_DIR / "coverage.png", optimize=True)
    cov_kb = (OUT_DIR / "coverage.png").stat().st_size / 1024
    log(f"  wrote public/data/dem/coverage.png ({cov_kb:.0f} KB) - "
        f"{pct:.1f}% real stereo coverage")

    write_json(OUT_DIR / "meta.json", {
        "provenance": "REAL",
        "product_name": dem_src["product_name"],
        "title": dem_src["title"],
        "mission": dem_src["mission"],
        "instrument": dem_src["instrument"],
        "source_url": url,
        "credit": dem_src["credit"],
        "native_map_scale_m_per_px": ras.map_scale,
        "projection": dem_src["projection"],
        "elevation_datum": dem_src["elevation_datum"],
        "bounds": {"west": w, "south": s, "east": e, "north": n},
        "size_m": {"width": width_m, "height": height_m},
        "grid": {"width": out_w, "height": out_h},
        "ground_resolution_m": {"x": width_m / out_w, "y": height_m / out_h},
        "elevation_m": {"min": zmin, "max": zmax},
        "encoding": "16-bit greyscale PNG; elevation = min + value/65535 * (max - min)",
        "coverage_mask": "coverage.png - 255 where the stereo DTM has real data, 0 where it does not",
        "stereo_coverage_percent": round(pct, 1),
        "nodata_filled_cells": int((~valid).sum()),
        "nodata_note": ("Cells outside the HiRISE stereo swath are filled by neighbour "
                        "diffusion so the terrain mesh stays continuous. They are flagged "
                        "in coverage.png and barred by the route planner."),
        "mars_radius_m": MARS_RADIUS_M,
        "retrieved": "2026-11-13",
    })
    return 0


def fill_nans(a: np.ndarray) -> np.ndarray:
    """Cheap iterative gap fill: average of finite 4-neighbours, repeated."""
    out = a.copy()
    for _ in range(64):
        bad = ~np.isfinite(out)
        if not bad.any():
            break
        padded = np.pad(out, 1, constant_values=np.nan)
        stack = np.stack([
            padded[:-2, 1:-1], padded[2:, 1:-1],
            padded[1:-1, :-2], padded[1:-1, 2:],
        ])
        with np.errstate(invalid="ignore"):
            mean = np.nanmean(stack, axis=0)
        out[bad] = mean[bad]
    # anything still unfilled (fully isolated) -> global mean
    bad = ~np.isfinite(out)
    if bad.any():
        out[bad] = np.nanmean(out)
    return out


if __name__ == "__main__":
    sys.exit(main())
