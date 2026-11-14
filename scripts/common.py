"""Shared helpers for the MARSWALK data pipeline.

Nothing here invents data. Every function either parses a product we
downloaded or does arithmetic on it.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from pathlib import Path

import numpy as np
import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
PUBLIC_DATA = ROOT / "public" / "data"
CACHE = SCRIPTS / ".cache"

UA = {"User-Agent": "marswalk-spaceapps-2026/1.0 (NASA Space Apps entry; data pipeline)"}

MARS_RADIUS_M = 3396190.0
M_PER_DEG_LAT = math.pi * MARS_RADIUS_M / 180.0


def m_per_deg_lon(lat_deg: float) -> float:
    return M_PER_DEG_LAT * math.cos(math.radians(lat_deg))


def load_sources() -> dict:
    with open(SCRIPTS / "sources.json", encoding="utf-8") as f:
        return json.load(f)


def ensure_dirs(*paths: Path) -> None:
    for p in paths:
        p.mkdir(parents=True, exist_ok=True)


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------- HTTP helpers

def http_get(url: str, *, timeout: int = 90, retries: int = 3, headers: dict | None = None):
    h = dict(UA)
    if headers:
        h.update(headers)
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=h, timeout=timeout)
            if r.status_code in (200, 206):
                return r
            last = f"HTTP {r.status_code}"
        except Exception as e:  # network flake
            last = str(e)[:120]
    raise RuntimeError(f"GET failed after {retries} tries ({last}): {url}")


def http_range(url: str, start: int, end: int, *, timeout: int = 90, retries: int = 3):
    """Inclusive byte range. Returns raw bytes."""
    r = http_get(url, timeout=timeout, retries=retries,
                 headers={"Range": f"bytes={start}-{end}"})
    return r.content


def head(url: str):
    return requests.head(url, headers=UA, timeout=60, allow_redirects=True)


# ------------------------------------------------------------- PDS3 labels

class PdsLabel:
    """Minimal PDS3 attached-label parser - enough for HiRISE DTM rasters."""

    def __init__(self, text: str):
        self.text = text
        self.kv: dict[str, str] = {}
        for line in text.splitlines():
            m = re.match(r"\s*([\^A-Z_0-9:]+)\s*=\s*(.+?)\s*$", line)
            if m:
                self.kv.setdefault(m.group(1), m.group(2).strip())

    def raw(self, key: str, default: str = "") -> str:
        return self.kv.get(key, default)

    def num(self, key: str, default: float | None = None) -> float | None:
        v = self.kv.get(key)
        if v is None:
            return default
        m = re.search(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", v)
        return float(m.group(0)) if m else default

    def integer(self, key: str, default: int | None = None) -> int | None:
        v = self.num(key)
        return int(v) if v is not None else default


def fetch_pds_label(url: str, probe_bytes: int = 65536) -> PdsLabel:
    """Read just the top of a PDS3 file and parse its attached label."""
    raw = http_range(url, 0, probe_bytes - 1)
    text = raw.decode("ascii", "replace")
    end = text.find("END\r\n")
    if end < 0:
        end = text.find("\nEND\n")
    return PdsLabel(text[: end + 5] if end > 0 else text)


class PdsRaster:
    """Georeferenced view of a PDS3 EQUIRECTANGULAR raster served over HTTP."""

    def __init__(self, url: str, label: PdsLabel):
        self.url = url
        self.label = label

        self.record_bytes = label.integer("RECORD_BYTES")
        self.lines = label.integer("LINES")
        self.samples = label.integer("LINE_SAMPLES")
        self.sample_bits = label.integer("SAMPLE_BITS", 32)
        self.sample_type = label.raw("SAMPLE_TYPE", "PC_REAL")
        self.bpp = self.sample_bits // 8

        ptr = label.raw("^IMAGE", "1")
        m = re.search(r"(\d+)", ptr)
        start_record = int(m.group(1)) if m else 1
        self.data_offset = (start_record - 1) * self.record_bytes

        self.west = label.num("WESTERNMOST_LONGITUDE")
        self.east = label.num("EASTERNMOST_LONGITUDE")
        self.south = label.num("MINIMUM_LATITUDE")
        self.north = label.num("MAXIMUM_LATITUDE")
        self.map_scale = label.num("MAP_SCALE")
        self.map_resolution = label.num("MAP_RESOLUTION")
        self.valid_min = label.num("VALID_MINIMUM")
        self.valid_max = label.num("VALID_MAXIMUM")

        self.dtype = "<f4" if "PC_REAL" in self.sample_type else ">f4"

    @property
    def expected_size(self) -> int:
        return self.data_offset + self.lines * self.samples * self.bpp

    def check(self) -> str:
        """Cross-check the two independent georeferencing paths in the label."""
        notes = []
        r = head(self.url)
        actual = int(r.headers.get("Content-Length", 0))
        if actual != self.expected_size:
            notes.append(
                f"SIZE MISMATCH: label implies {self.expected_size} bytes, server reports {actual}"
            )
        # degrees-per-pixel from the corner keywords vs from MAP_RESOLUTION
        dpp_corners = (self.east - self.west) / self.samples
        dpp_res = 1.0 / self.map_resolution if self.map_resolution else None
        if dpp_res:
            rel = abs(dpp_corners - dpp_res) / dpp_res
            if rel > 0.02:
                notes.append(
                    f"GEOREF MISMATCH: corners give {dpp_corners:.3e} deg/px, "
                    f"MAP_RESOLUTION gives {dpp_res:.3e} deg/px ({rel*100:.1f}% apart)"
                )
        return "; ".join(notes)

    # --- pixel <-> lon/lat (linear, from the corner keywords) ---
    def lon_to_sample(self, lon: float) -> float:
        return (lon - self.west) / (self.east - self.west) * self.samples

    def lat_to_line(self, lat: float) -> float:
        return (self.north - lat) / (self.north - self.south) * self.lines

    def sample_to_lon(self, s: float) -> float:
        return self.west + (s + 0.5) / self.samples * (self.east - self.west)

    def line_to_lat(self, l: float) -> float:
        return self.north - (l + 0.5) / self.lines * (self.north - self.south)

    def row_byte_range(self, line: int, s0: int, s1: int) -> tuple[int, int]:
        """Byte range for samples [s0, s1) of one image line."""
        base = self.data_offset + line * self.samples * self.bpp
        return base + s0 * self.bpp, base + s1 * self.bpp - 1


# ------------------------------------------------------------------ geometry

def bbox_metres(west: float, south: float, east: float, north: float) -> tuple[float, float]:
    """AOI size in metres (width, height) on Mars."""
    mid_lat = (south + north) / 2.0
    return (east - west) * m_per_deg_lon(mid_lat), (north - south) * M_PER_DEG_LAT


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    log(f"  wrote {path.relative_to(ROOT)} ({os.path.getsize(path)/1024:.1f} KB)")


def rdp(points, eps):
    """Douglas-Peucker line simplification. Iterative, so long rings are safe."""
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
                d = ((x - (x0 + t * dx)) ** 2 + (y - (y0 + t * dy)) ** 2) ** 0.5
            if d > best_d:
                best_i, best_d = i, d
        if best_d > eps:
            keep[best_i] = True
            stack.append((i0, best_i))
            stack.append((best_i, i1))
    return [p for p, k in zip(points, keep) if k]


# ------------------------------------------------------------------- the DEM

def load_dem(dem_dir: Path):
    """Decode the RGB-packed heightmap back to metres, with its coverage mask.

    `fetch_dem.py` packs the 16-bit elevation across R and G and carries the
    stereo coverage flag in B, because a browser canvas drops the low byte of a
    16-bit PNG. Every consumer has to unpack it the same way, so it is unpacked
    in one place. Returns (elevation_m, coverage_bool, dem_meta).
    """
    from PIL import Image

    meta = json.loads((dem_dir / "meta.json").read_text(encoding="utf-8"))
    rgb = np.array(Image.open(dem_dir / "heightmap.png").convert("RGB"))
    zmin = float(meta["elevation_m"]["min"])
    zmax = float(meta["elevation_m"]["max"])
    v16 = (rgb[:, :, 0].astype(np.uint32) << 8) | rgb[:, :, 1].astype(np.uint32)
    z = (zmin + v16.astype(np.float32) / 65535.0 * (zmax - zmin)).astype(np.float32)
    coverage = rgb[:, :, 2] > 127
    return z, coverage, meta


def dem_lonlat_fn(bounds: dict, width: int, height: int):
    """Return a pixel -> [lon, lat] mapper for a grid on the DEM's bounds."""
    def to_lonlat(px, py):
        return [round(bounds["west"] + px / width * (bounds["east"] - bounds["west"]), 6),
                round(bounds["north"] - py / height * (bounds["north"] - bounds["south"]), 6)]
    return to_lonlat


# ------------------------------------------- mask -> polygon ring tracing
#
# Shared by derive_terrain.py and derive_geochem_units.py: both turn a boolean
# class mask into GeoJSON polygons, and two copies of a tracer would drift.

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
