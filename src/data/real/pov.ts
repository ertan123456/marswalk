/**
 * Ground-level views for each science station.
 *
 * PROVENANCE: REAL. Curiosity Navcam/Mastcam frames from the NASA MSL raw
 * image archive, chosen near the sol each station is pinned to and downloaded
 * offline by scripts/fetch_pov.py.
 *
 * Each frame is labelled with what it actually is. "horizon" frames look out
 * across the ground; "workspace" frames are the rover's arm-work views, which
 * is most of what Navcam shoots. Both are real views of that station, and the
 * card says which one you are looking at rather than implying every frame is a
 * panorama.
 */

export interface PovFrame {
  file: string;
  sol: number;
  instrument: string;
  title: string;
  caption: string;
  credit: string;
  date_taken_utc: string;
  image_id: string;
  source_page: string;
  original_image: string;
  source_px: [number, number];
  stored_px: [number, number];
  view: 'horizon' | 'workspace';
}

export interface PovStation {
  code: string;
  title: string;
  pinned_sol: number;
  frames: PovFrame[];
  note?: string;
}

export interface PovIndex {
  provenance: string;
  product_name: string;
  mission: string;
  api: string;
  browse_page: string;
  selection: string;
  processing: string;
  credit: string;
  retrieved: string;
  stations: PovStation[];
}

const BASE = import.meta.env.BASE_URL || '/';

let cache: PovIndex | null = null;
let loading: Promise<PovIndex | null> | null = null;

export async function loadPov(): Promise<PovIndex | null> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await fetch(BASE + 'data/pov/index.json');
      if (!r.ok) return null;
      cache = (await r.json()) as PovIndex;
      return cache;
    } catch {
      // The gallery is an enhancement; the station card works without it.
      return null;
    }
  })();
  return loading;
}

export function povFor(code: string): PovStation | undefined {
  return cache?.stations.find((s) => s.code === code);
}

export function povMeta(): PovIndex | null {
  return cache;
}

export function frameUrl(f: PovFrame): string {
  return BASE + f.file;
}

export function viewLabel(f: PovFrame): string {
  const cam = f.instrument.startsWith('NAV')
    ? 'Navcam'
    : f.instrument.startsWith('MAST')
      ? 'Mastcam'
      : f.instrument;
  const kind = f.view === 'horizon' ? 'view across the station' : 'rover workspace';
  return `${cam} · sol ${f.sol} · ${kind}`;
}
