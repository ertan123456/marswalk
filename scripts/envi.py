"""ENVI header parsing, for the CRISM MTRDR summary cubes.

A CRISM MTRDR product ships three files side by side and they do not carry the
same information:

  *.lbl   PDS3 *detached* label - the map-projection corner keywords
  *.hdr   ENVI header           - `band names` and `data ignore value`
  *.img   the raster itself

Only the header names the bands, and only the header gives the no-data
sentinel; only the label gives the corner longitudes and latitudes. So we read
both and cross-check one against the other instead of trusting either alone.

Kept out of common.py because the detached-label case has nothing in common
with the attached-label HiRISE path already there, and folding the two together
would have made both harder to read.
"""
from __future__ import annotations

import math
import re

# A braced ENVI value may run over several lines (`band names = { ... }`).
BRACED_RE = re.compile(r"^([ \t]*[A-Za-z][A-Za-z0-9 _]*?)[ \t]*=[ \t]*\{(.*?)\}",
                       re.S | re.M)
KV_RE = re.compile(r"^[ \t]*([A-Za-z][A-Za-z0-9 _]*?)[ \t]*=[ \t]*(\S.*?)[ \t]*$")

# ENVI `data type` code -> numpy dtype string, little-endian.
ENVI_DTYPE = {1: "u1", 2: "<i2", 3: "<i4", 4: "<f4", 5: "<f8", 12: "<u2"}


class EnviHeader:
    """Everything we need from an ENVI .hdr, and nothing we do not."""

    def __init__(self, text: str):
        self.text = text
        self.kv: dict[str, str] = {}

        # Flatten braced values onto one line first, then parse line by line.
        flat = BRACED_RE.sub(
            lambda m: m.group(1) + " = {" + " ".join(m.group(2).split()) + "}", text
        )
        for raw in flat.splitlines():
            m = KV_RE.match(raw)
            if m:
                self.kv.setdefault(
                    m.group(1).strip().lower(),
                    m.group(2).strip().strip("{}").strip(),
                )

        self.samples = int(float(self.kv["samples"]))
        self.lines = int(float(self.kv["lines"]))
        self.bands = int(float(self.kv.get("bands", 1)))
        self.offset = int(float(self.kv.get("header offset", 0)))
        self.interleave = self.kv.get("interleave", "bsq").lower()
        self.byte_order = int(float(self.kv.get("byte order", 0)))

        code = int(float(self.kv.get("data type", 4)))
        if code not in ENVI_DTYPE:
            raise ValueError(f"unsupported ENVI data type {code}")
        self.dtype = ENVI_DTYPE[code]
        if self.byte_order == 1 and self.dtype.startswith("<"):
            self.dtype = ">" + self.dtype[1:]
        self.bpp = int(self.dtype[-1])

        # The no-data sentinel lives here and nowhere else in the product.
        iv = self.kv.get("data ignore value")
        self.ignore = float(iv) if iv is not None else None

        self.band_names = [n.strip() for n in self.kv.get("band names", "").split(",")
                           if n.strip()]
        self.map_info = [v.strip() for v in self.kv.get("map info", "").split(",")]

    # ------------------------------------------------------- georeferencing
    #
    # map info = {name, ref_x, ref_y, easting, northing, dx, dy, datum, units}
    # ref_x / ref_y are 1-based and name the upper-left corner of that pixel.
    # On an equirectangular projection with a standard parallel of 0 the
    # forward transform is x = R*lon, y = R*lat, so the inverse is a division.
    def bounds(self, radius_m: float) -> dict:
        if len(self.map_info) < 7:
            raise ValueError("ENVI map info is too short to georeference")
        ref_x, ref_y = float(self.map_info[1]), float(self.map_info[2])
        east_m, north_m = float(self.map_info[3]), float(self.map_info[4])
        dx, dy = float(self.map_info[5]), float(self.map_info[6])
        x0 = east_m - (ref_x - 1.0) * dx
        y0 = north_m + (ref_y - 1.0) * dy
        deg = 180.0 / math.pi / radius_m
        return {
            "west": x0 * deg,
            "north": y0 * deg,
            "east": (x0 + self.samples * dx) * deg,
            "south": (y0 - self.lines * dy) * deg,
            "scale_m": dx,
        }

    def band_index(self, name: str) -> int:
        """0-based plane index of a named band. Raises rather than guessing."""
        try:
            return self.band_names.index(name)
        except ValueError:
            raise KeyError(
                f"band {name!r} is not in this cube. It has {len(self.band_names)} "
                f"bands, starting {', '.join(self.band_names[:6])}"
            ) from None

    def band_byte_range(self, band0: int) -> tuple[int, int]:
        """Inclusive byte range of one whole BAND_SEQUENTIAL plane.

        A BSQ plane is contiguous, so a single range request fetches a whole
        summary parameter: 2.2 MB out of a 139 MB cube. Reading row by row
        would be thousands of requests for the same bytes.
        """
        if self.interleave != "bsq":
            raise ValueError(f"band_byte_range needs BSQ; this cube is {self.interleave}")
        plane = self.samples * self.lines * self.bpp
        start = self.offset + band0 * plane
        return start, start + plane - 1
