"""Download real Curiosity frames for each science station.

PROVENANCE: REAL. Frames come from the NASA MSL raw image archive, selected by
the sol each station is pinned to. These are the "what you will actually see
when you get there" images on the waypoint cards.

Cameras: Mastcam and Navcam only. Hazcams point at the wheels and MAHLI is a
hand lens - neither is a view of the landscape.

Outputs
  public/data/pov/<CODE>/<n>.jpg
  public/data/pov/index.json
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import requests
from PIL import Image

from common import PUBLIC_DATA, UA, log, write_json

OUT_DIR = PUBLIC_DATA / "pov"
API = ("https://mars.nasa.gov/rss/api/?feed=raw_images&category=msl&feedtype=json"
       "&num=100&page={page}&order=sol+asc"
       "&condition_2={lo}:sol:gte&condition_3={hi}:sol:lte")

# The API caps a page at 100 records, so wide sol windows need paging.
MAX_PAGES = 6
# Anything smaller than this on the long edge is a thumbnail, not a view.
MIN_SOURCE_PX = 600
# How many frames to download and score before choosing the best few.
POOL = 16

PER_STATION = 3
MAX_PX = 860
JPEG_QUALITY = 78

# Station code -> the sol its position is pinned to (see src/data/real/science.ts)
STATIONS = [
    ("GT-01", "Glen Torridon — clay-bearing unit", 2300),
    ("GP-02", "Greenheugh Pediment", 2700),
    ("SU-03", "Sulfate-bearing unit", 3504),
    ("GV-04", "Gediz Vallis Ridge", 3899),
    ("GV-05", "Gediz Vallis Channel", 4301),
    ("BX-06", "Boxwork region", 4893),
]

# Landscape cameras. Navcam first: its frames are full 1024x1024 scenes, while
# Mastcam is usually delivered as narrow sub-frames of a mosaic.
PREFERRED = ("NAV", "MAST")


def pick_url(files: dict) -> str | None:
    for key in ("large", "full_res", "medium", "small"):
        u = files.get(key)
        if u:
            return u.replace("http://", "https://")
    return None


def instrument(img: dict) -> str:
    cam = img.get("camera") or {}
    return str(cam.get("instrument") or "")


def rank(img: dict, sol: int) -> tuple:
    inst = instrument(img)
    cam_rank = 99
    for i, p in enumerate(PREFERRED):
        if inst.startswith(p):
            cam_rank = i
            break
    full = 0 if img.get("sample_type") == "full" else 1
    eye = 0 if "LEFT" in inst else 1
    return (full, cam_rank, abs(int(img.get("sol", sol)) - sol), eye)


def fetch_candidates(sol: int, span: int) -> list[dict]:
    """Page through the sol window and keep the landscape cameras."""
    keep: list[dict] = []
    seen: set[str] = set()
    for page in range(MAX_PAGES):
        url = API.format(page=page, lo=sol - span, hi=sol + span)
        try:
            r = requests.get(url, headers=UA, timeout=90)
            r.raise_for_status()
            imgs = r.json().get("images", [])
        except Exception:
            break
        if not imgs:
            break
        for i in imgs:
            iid = i.get("imageid")
            if iid in seen or not instrument(i).startswith(PREFERRED):
                continue
            seen.add(iid)
            keep.append(i)
        if len(imgs) < 100:
            break
    keep.sort(key=lambda i: rank(i, sol))
    return keep


def sky_metrics(im: Image.Image) -> tuple[float, bool]:
    """Score a frame as a view out across the ground, with the horizon in it.

    Two things had to be learned from the data here. First, sky is DARK in a
    raw Navcam EDR - these are uncalibrated frames stretched for the ground, so
    sky lands near the bottom of the range, 100+ DN below the terrain. Second,
    darkness at the top alone is not enough: the archive is full of sky-only
    calibration frames that are nothing but a smooth grey field.

    So a usable frame needs both - a dark band at the top AND textured ground
    across the bottom. Frames that fail are still real images of the station,
    they are just arm-workspace views, and are labelled as such.
    """
    a = np.asarray(im.convert("L"), dtype=np.float32)
    h = a.shape[0]
    top = a[: max(1, int(h * 0.10))]
    bottom = a[int(h * 0.60):]
    sky_above = float(bottom.mean() - top.mean())
    ground_texture = float(bottom.std())
    has_horizon = sky_above > 60.0 and ground_texture > 28.0
    return sky_above + ground_texture, has_horizon


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index = []
    total_bytes = 0

    for code, title, sol in STATIONS:
        log(f"\n{code}  {title}  (sol {sol})")
        picked: list[dict] = []
        for span in (3, 12, 40):
            try:
                cands = fetch_candidates(sol, span)
            except Exception as e:
                log(f"  API error at span {span}: {str(e)[:90]}")
                continue
            log(f"  span +/-{span}: {len(cands)} Mastcam/Navcam frames")
            seen = {p["imageid"] for p in picked}
            for c in cands:
                if c["imageid"] in seen:
                    continue
                picked.append(c)
                seen.add(c["imageid"])
            # keep a deep candidate pool: thumbnails get rejected after download
            if len(picked) >= PER_STATION * 8:
                break

        if not picked:
            log("  NO FRAMES FOUND - leaving the placeholder in place")
            index.append({"code": code, "sol": sol, "frames": [], "note": "no Mastcam/Navcam frame found near this sol"})
            continue

        station_dir = OUT_DIR / code
        station_dir.mkdir(parents=True, exist_ok=True)

        # Download a pool, score each for "is this a view out", keep the best.
        pool = []
        for img in picked:
            if len(pool) >= POOL:
                break
            url = pick_url(img.get("image_files") or {})
            if not url:
                continue
            try:
                resp = requests.get(url, headers=UA, timeout=120)
                resp.raise_for_status()
                im = Image.open(io.BytesIO(resp.content)).convert("RGB")
            except Exception as e:
                log(f"    skip: download failed ({str(e)[:60]})")
                continue
            if max(im.size) < MIN_SOURCE_PX:
                continue
            sc, sky = sky_metrics(im)
            pool.append((sc, sky, img, im, url))
            time.sleep(0.2)

        # real sky first, then by how much of a view out the frame is
        pool.sort(key=lambda t: (not t[1], -t[0]))
        if pool:
            n_sky = sum(1 for t in pool if t[1])
            log(f"  scored {len(pool)} frames, {n_sky} with sky in shot")

        frames = []
        n = 0
        for score, has_sky, img, im, url in pool[:PER_STATION]:
            n += 1
            w, h = im.size
            if max(w, h) > MAX_PX:
                scale = MAX_PX / max(w, h)
                im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
            out = station_dir / f"{n}.jpg"
            im.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            size = out.stat().st_size
            total_bytes += size

            caption = re.sub(r"\s+", " ", str(img.get("caption") or "")).strip()
            frames.append({
                "file": f"data/pov/{code}/{n}.jpg",
                "sol": img.get("sol"),
                "instrument": instrument(img),
                "title": img.get("title"),
                "caption": caption[:400],
                "credit": img.get("credit") or "NASA/JPL-Caltech",
                "date_taken_utc": img.get("date_taken_utc"),
                "image_id": img.get("imageid"),
                "source_page": img.get("link"),
                "original_image": url,
                "source_px": [w, h],
                "horizon_score": round(float(score), 1),
                "view": "horizon" if has_sky else "workspace",
                "stored_px": list(im.size),
                "bytes": size,
            })
            log(f"    frame {n}: sol {img.get('sol')} {instrument(img):<13} "
                f"{w}x{h} -> {im.size[0]}x{im.size[1]}  {size/1024:.0f} KB  "
                f"{'horizon' if has_sky else 'workspace'} ({score:.0f})")

        index.append({
            "code": code, "title": title, "pinned_sol": sol,
            "frames": frames,
        })

    write_json(OUT_DIR / "index.json", {
        "provenance": "REAL",
        "product_name": "MSL raw images",
        "mission": "Mars Science Laboratory (Curiosity)",
        "api": "https://mars.nasa.gov/rss/api/ (feed=raw_images, category=msl)",
        "browse_page": "https://mars.nasa.gov/msl/multimedia/raw-images/",
        "selection": ("Navcam and Mastcam frames near the sol each station is pinned to. A pool is downloaded per station and scored for how much of a view out to the horizon each one is - arm-workspace frames have the turret in shot and no sky - and the best few are kept. Hazcam and MAHLI are excluded outright."),
        "processing": f"resized to {MAX_PX} px on the long edge, JPEG q{JPEG_QUALITY}",
        "credit": "NASA/JPL-Caltech (Navcam); NASA/JPL-Caltech/MSSS (Mastcam)",
        "retrieved": "2026-11-14",
        "stations": index,
    })
    log(f"\ntotal downloaded: {total_bytes/1024/1024:.2f} MB across "
        f"{sum(len(s.get('frames', [])) for s in index)} frames")
    return 0


if __name__ == "__main__":
    sys.exit(main())
