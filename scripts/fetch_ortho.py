"""Build the AOI orbital basemap from the real HiRISE mosaic on NASA Mars Trek.

PROVENANCE: REAL. Source is the `curiosity_hirise_mosaic` WMTS layer (MRO
HiRISE RED). We fetch only the tiles covering the AOI and stitch them.

Unlike the Trek DEM layer - which is only an 8-bit render of elevation and was
therefore rejected for topography - an 8-bit greyscale image is exactly what a
HiRISE RED mosaic *is*, so these tiles are the real product.

Outputs
  public/data/ortho/basemap.webp
  public/data/ortho/meta.json
"""
from __future__ import annotations

import concurrent.futures as cf
import io
import sys
import threading

import numpy as np
from PIL import Image

from common import PUBLIC_DATA, http_get, load_sources, log, write_json

OUT_DIR = PUBLIC_DATA / "ortho"
ZOOM = 13          # ~5.09 m/px at Mars equator
TILE = 256
WORKERS = 10


def tile_bounds(z: int):
    """Degrees per tile in the Trek geographic scheme."""
    return 180.0 / (2 ** z)


def main() -> int:
    src = load_sources()
    ortho = src["ortho"]
    tpl = ortho["tile_template"]

    # Register to the DEM's actual bounds so the layers overlay exactly.
    dem_meta_path = PUBLIC_DATA / "dem" / "meta.json"
    if not dem_meta_path.exists():
        log("FATAL: run fetch_dem.py first - the ortho registers to the DEM bounds")
        return 1
    import json
    dem_meta = json.loads(dem_meta_path.read_text(encoding="utf-8"))
    b = dem_meta["bounds"]
    w, s, e, n = b["west"], b["south"], b["east"], b["north"]
    log(f"AOI (from DEM): lon {w:.5f}..{e:.5f}  lat {s:.5f}..{n:.5f}")

    deg = tile_bounds(ZOOM)
    col0 = int((w + 180.0) / deg)
    col1 = int((e + 180.0) / deg)
    row0 = int((90.0 - n) / deg)
    row1 = int((90.0 - s) / deg)
    ncols, nrows = col1 - col0 + 1, row1 - row0 + 1
    log(f"zoom {ZOOM}: {ncols} x {nrows} = {ncols * nrows} tiles of {TILE}px")

    canvas = Image.new("L", (ncols * TILE, nrows * TILE), color=0)
    got = [0]
    missing = [0]
    lock = threading.Lock()

    def fetch(job):
        ci, ri = job
        col, row = col0 + ci, row0 + ri
        url = tpl.format(z=ZOOM, row=row, col=col)
        try:
            r = http_get(url, timeout=60, retries=2)
            img = Image.open(io.BytesIO(r.content)).convert("L")
        except Exception:
            with lock:
                missing[0] += 1
            return
        with lock:
            canvas.paste(img, (ci * TILE, ri * TILE))
            got[0] += 1
            if got[0] % 20 == 0:
                log(f"    tiles {got[0]}/{ncols * nrows}")

    jobs = [(c, r) for r in range(nrows) for c in range(ncols)]
    log(f"  fetching tiles ({WORKERS} workers)...")
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(fetch, jobs))
    log(f"  fetched {got[0]} tiles, {missing[0]} missing/outside mosaic")

    if got[0] == 0:
        log("FATAL: no tiles returned")
        return 1

    # --- crop the mosaic grid down to the exact AOI ---------------------------
    grid_w_deg = ncols * deg
    grid_n_lat = 90.0 - row0 * deg
    grid_w_lon = col0 * deg - 180.0

    px_per_deg = (ncols * TILE) / grid_w_deg
    left = int(round((w - grid_w_lon) * px_per_deg))
    right = int(round((e - grid_w_lon) * px_per_deg))
    top = int(round((grid_n_lat - n) * px_per_deg))
    bottom = int(round((grid_n_lat - s) * px_per_deg))
    crop = canvas.crop((left, top, right, bottom))
    log(f"  cropped to AOI: {crop.width} x {crop.height} px")

    arr = np.array(crop)
    filled = float((arr > 0).mean() * 100.0)
    log(f"  image coverage: {filled:.1f}% non-empty")

    # Gentle percentile stretch - HiRISE RED RDRs are low-contrast as delivered.
    valid = arr[arr > 0]
    if valid.size:
        lo, hi = np.percentile(valid, [1.0, 99.0])
        log(f"  stretch: {lo:.0f}..{hi:.0f} -> 0..255")
        stretched = np.clip((arr.astype(np.float32) - lo) / max(1.0, hi - lo), 0, 1)
        arr = (stretched * 255).astype(np.uint8)
        arr[np.array(crop) == 0] = 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = Image.fromarray(arr, mode="L")
    out.save(OUT_DIR / "basemap.webp", format="WEBP", quality=88, method=5)
    kb = (OUT_DIR / "basemap.webp").stat().st_size / 1024
    log(f"  wrote public/data/ortho/basemap.webp ({kb:.0f} KB)")

    m_per_deg_lat = np.pi * 3396190.0 / 180.0
    write_json(OUT_DIR / "meta.json", {
        "provenance": "REAL",
        "product_name": ortho["product_name"],
        "title": ortho["title"],
        "mission": ortho["mission"],
        "instrument": ortho["instrument"],
        "source_url": ortho["capabilities"],
        "tile_template": tpl,
        "credit": ortho["credit"],
        "zoom": ZOOM,
        "native_m_per_px": round((180.0 / (2 ** ZOOM) / TILE) * m_per_deg_lat, 3),
        "bounds": {"west": w, "south": s, "east": e, "north": n},
        "size_px": {"width": crop.width, "height": crop.height},
        "tiles_fetched": got[0],
        "tiles_missing": missing[0],
        "coverage_percent": round(filled, 1),
        "processing": "tiles stitched, cropped to AOI, 1-99 percentile contrast stretch",
        "retrieved": "2026-11-14",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
