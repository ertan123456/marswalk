/**
 * ABOUT / DATA — the provenance page.
 *
 * Every dataset in the app, what it is, where it came from, and which of the
 * three categories it falls into. Also the sources that were checked and NOT
 * used, with the reason, because "we looked and it was not good enough" is a
 * result too and a reviewer cannot audit a choice they cannot see.
 *
 * The layer table is generated from the live registry, so it cannot drift out
 * of date: if a layer ships, it appears here with its badge.
 */

import { AOI } from '../../lib/geo';
import { LAYER_REGISTRY, provenanceCounts } from '../../data/config';
import type { Provenance } from '../../data/types';
import sources from '../../../scripts/sources.json';
import { Badge, Panel, ProvenanceBadge } from '../ui/primitives';

interface SourceEntry {
  provenance?: string;
  product_name?: string;
  title?: string;
  mission?: string;
  instrument?: string;
  url?: string;
  archive_page?: string;
  capabilities?: string;
  catalog?: string;
  waypoints_url?: string;
  traverse_url?: string;
  api?: string;
  browse_page?: string;
  interactive_maps?: string;
  informed_by?: string;
  citation?: string;
  doi?: string;
  credit?: string;
  note?: string;
  reason?: string;
  status?: string;
  method?: string;
  access?: string;
  verified?: string;
  basis?: string;
  format?: string;
}

const OFFICIAL_RESOURCES = [
  {
    name: 'NASA Mars Trek',
    url: 'https://trek.nasa.gov/mars/',
    used: 'Layer catalogue queried for every product over this AOI. The HiRISE ortho mosaic is served from it.',
  },
  {
    name: "Curiosity's Proposed Path up Mount Sharp",
    url: 'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
    used: 'Names the units and which part of the mission worked each one. Informs the sol windows behind the science-region corridors.',
  },
  {
    name: 'USGS Astrogeology interactive maps of Mars',
    url: 'https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars',
    used: 'Searched for a geologic map at a usable scale over this AOI. None exists as GIS data — see "checked and not used".',
  },
  {
    name: 'NASA Worldview',
    url: 'https://worldview.earthdata.nasa.gov/',
    used: 'Earth observation. Used only as design inspiration for the layer-panel interaction. No Earth data is on the Mars map.',
  },
  {
    name: 'Curiosity raw images',
    url: 'https://mars.nasa.gov/msl/multimedia/raw-images/',
    used: 'The ground-level view on every station card. The Mars 2020 archive is the sister resource, but Perseverance is in Jezero, not Gale.',
  },
];

const PROVENANCE_EXPLAINER: { tag: Provenance; text: string }[] = [
  { tag: 'REAL', text: 'Downloaded from a NASA or USGS product. The product name and link are below.' },
  { tag: 'DERIVED', text: 'Computed by us from REAL data. Slope from a DEM is derived; it is not a measurement in its own right.' },
  { tag: 'MODELED', text: 'Built from published measurements rather than ingested telemetry, and cited. Never presented as a reading.' },
];

function links(e: SourceEntry): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const add = (label: string, href?: string) => {
    if (href && href.startsWith('http')) out.push({ label, href });
  };
  add('product', e.url);
  add('archive', e.archive_page);
  add('catalogue', e.catalog);
  add('capabilities', e.capabilities);
  add('waypoints', e.waypoints_url);
  add('traverse', e.traverse_url);
  add('API', e.api);
  add('browse', e.browse_page);
  add('maps', e.interactive_maps);
  add('informed by', e.informed_by);
  add('paper', e.doi);
  return out;
}

function SourceCard({ id, entry }: { id: string; entry: SourceEntry }) {
  const tag = (entry.provenance ?? '').split(' ')[0] as Provenance;
  const valid = tag === 'REAL' || tag === 'DERIVED' || tag === 'MODELED';
  return (
    <div className="border border-line/60 rounded-[2px] p-2.5 bg-deck-800/30">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] text-ink leading-tight">{entry.title ?? id}</div>
          {entry.product_name && (
            <div className="num text-[10px] text-mars-300 mt-0.5 break-all">{entry.product_name}</div>
          )}
        </div>
        {valid ? <ProvenanceBadge provenance={tag} /> : <Badge>{entry.provenance}</Badge>}
      </div>

      {(entry.mission || entry.instrument) && (
        <div className="text-[10px] text-ink-faint mt-1">
          {[entry.mission, entry.instrument].filter(Boolean).join(' · ')}
        </div>
      )}
      {entry.citation && <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">{entry.citation}</p>}
      {entry.basis && <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">Basis: {entry.basis}</p>}
      {entry.method && <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">{entry.method}</p>}
      {entry.note && <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">{entry.note}</p>}
      {entry.access && <p className="text-[10px] text-ink-faint leading-relaxed mt-1.5">{entry.access}</p>}
      {entry.verified && (
        <p className="num text-[10px] text-nominal/80 leading-relaxed mt-1.5">Verified {entry.verified}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-1.5">
        {links(entry).map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="num text-[10px] text-probe-400 underline decoration-dotted hover:text-probe-500"
          >
            {l.label} ↗
          </a>
        ))}
      </div>
      {entry.credit && <div className="num text-[10px] text-ink-faint mt-1.5">{entry.credit}</div>}
    </div>
  );
}

export function About() {
  const counts = provenanceCounts();
  const src = sources as unknown as Record<string, SourceEntry & Record<string, unknown>>;
  const rejected = sources.rejected as unknown as Record<string, SourceEntry>;
  const used = ['dem', 'ortho', 'traverse', 'pov_images', 'science_regions', 'radiation', 'weather', 'geology'];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] p-3 space-y-2">
        <Panel title="About MARSWALK">
          <h1 className="text-[17px] text-ink leading-snug">
            An EVA planning map for the ground Curiosity has actually driven
          </h1>
          <p className="text-[12px] leading-relaxed text-ink-dim mt-2">
            MARSWALK plans a single Mars surface excursion across lower Mount Sharp in Gale Crater. It
            layers orbital and in-situ data over a {(AOI.sizeXM / 1000).toFixed(2)} × {(AOI.sizeYM / 1000).toFixed(2)} km
            strip, solves a safe walking or rover-assisted route across it, checks at every step that the
            crew could still abandon the EVA and reach safety with their reserve intact, and carries the
            same plan into a first-person helmet display.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-dim mt-2">
            The area of interest is the footprint of the HiRISE stereo DTM that covers Curiosity&rsquo;s
            traverse from the Glen Torridon clay-bearing unit, through Gediz Vallis, to the boxwork
            terrain the rover has been working in 2025 — 1,039 surveyed rover positions, sols 1167 to 5073.
          </p>
          <div className="flex gap-1.5 flex-wrap mt-3">
            <Badge tone="nominal">{counts.REAL} REAL</Badge>
            <Badge tone="accent">{counts.DERIVED} DERIVED</Badge>
            <Badge tone="caution">{counts.MODELED} MODELED</Badge>
          </div>
        </Panel>

        <Panel title="What the provenance tags mean">
          <div className="space-y-2">
            {PROVENANCE_EXPLAINER.map((p) => (
              <div key={p.tag} className="flex items-start gap-2.5">
                <div className="pt-[1px]">
                  <ProvenanceBadge provenance={p.tag} />
                </div>
                <p className="text-[11px] leading-relaxed text-ink-dim flex-1">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint mt-3 pl-2 border-l border-line">
            Nothing DERIVED or MODELED is presented as a raw measurement anywhere in the app. Every layer
            card, the click-inspect readout and this page all carry the same tag.
          </p>
        </Panel>

        <Panel title="Layers in the app">
          <div className="space-y-1">
            {LAYER_REGISTRY.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 py-1.5 border-b border-line/40 last:border-0"
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-ink leading-tight">{a.name}</div>
                  <div className="text-[10px] text-ink-faint mt-0.5">
                    {a.mission} · {a.instrument} · {a.group}
                  </div>
                  <p className="text-[10px] text-ink-dim leading-relaxed mt-1">{a.sourceNote}</p>
                  <div className="num text-[10px] text-ink-faint mt-1">{a.credit}</div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <ProvenanceBadge provenance={a.provenance} />
                  {a.sourceUrl && (
                    <a
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="num text-[10px] text-probe-400 underline decoration-dotted"
                    >
                      source ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Data sources, in full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {used.filter((k) => src[k]).map((k) => (
              <SourceCard key={k} id={k} entry={src[k]} />
            ))}
          </div>
        </Panel>

        <Panel title="Checked and not used">
          <p className="text-[11px] leading-relaxed text-ink-dim mb-2">
            Sources we opened, measured and rejected. Each one is recorded with the reason, because a
            choice a reviewer cannot see is a choice they cannot check.
          </p>
          <div className="space-y-1.5">
            {Object.entries(rejected)
              .filter(([k]) => !k.startsWith('_'))
              .map(([k, e]) => (
                <div key={k} className="border border-line/40 rounded-[2px] p-2 bg-deck-900/40">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="num text-[11px] text-ink-dim">{k}</span>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="num text-[10px] text-probe-400 underline decoration-dotted break-all"
                      >
                        {e.url.length > 62 ? e.url.slice(0, 62) + '…' : e.url} ↗
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-dim mt-1">{e.reason}</p>
                </div>
              ))}
          </div>
        </Panel>

        <Panel title="Official challenge resources">
          <div className="space-y-2">
            {OFFICIAL_RESOURCES.map((r) => (
              <div key={r.url} className="border-l border-line pl-2.5">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-probe-400 underline decoration-dotted"
                >
                  {r.name} ↗
                </a>
                <p className="text-[11px] leading-relaxed text-ink-dim mt-0.5">{r.used}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Limitations">
          <ul className="space-y-1.5">
            {[
              'The DTM is resampled to ~14.3 m per cell. At that posting a DEM cannot resolve metre-scale boulders, so the ruggedness term in the hazard layer is an index, not a rock count.',
              '25.2% of the AOI falls outside the HiRISE stereo swath. Those cells are filled so the terrain stays continuous, flagged in the coverage mask, and barred by the planner — the crew is not routed across ground we have no data for.',
              'Science-region corridors show where the rover worked each unit, not where the unit ends. Real geological contacts extend far beyond any rover track.',
              'Radiation and weather are modelled from published RAD and REMS results, not ingested telemetry. The solar particle event is an illustrative scenario and is labelled as one.',
              'Suit and rover mobility constants are plausible and editable, but not sourced from a published vehicle specification.',
              'No geologic map exists over this AOI at a usable scale, so there is no geology layer.',
            ].map((l, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-ink-dim pl-2 border-l border-line">
                {l}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Accessibility">
          <ul className="space-y-1.5">
            {[
              'No state is signalled by colour alone. A walk-back violation is red, heavier AND dotted on the map, stated in words on the station card, and read out in the click-inspect panel.',
              'GO / NO-GO carries a text verdict and a count of violations, not just a green or red dot.',
              'Every interactive control shows a visible focus ring, and the whole app is reachable by keyboard: 1-5 switch modes, G runs the guided demo, M measure, W the return-to-safety field, L the layer rail, Esc cancels.',
              'A reduced-motion preference is respected: pulses, blinks and transitions stop. The guided demo still advances, because its captions are information rather than decoration.',
              'Panels are labelled landmarks, icon-only controls carry names, and every image has descriptive alt text - including the rover frames and the NASA reference figure.',
              'Numbers are set in a tabular monospace face so columns align and digits do not shift between readings.',
            ].map((l, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-ink-dim pl-2 border-l border-line">
                {l}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Credits and compliance">
          <p className="text-[11px] leading-relaxed text-ink-dim">
            Data: NASA/JPL-Caltech, NASA/JPL-Caltech/University of Arizona (HiRISE), NASA/JPL-Caltech/MSSS
            (Mastcam), USGS. Built for the NASA Space Apps Challenge 2026, &ldquo;Interplanetary Survival
            Guide: Martian Map&rdquo;.
          </p>
          <p className="text-[11px] leading-relaxed text-ink-faint mt-2">
            This project is not affiliated with, endorsed by, or sponsored by NASA. No NASA logo, insignia
            or mission identifier is used as branding. NASA data is used under its open data policy and
            credited at every point of use.
          </p>
          <p className="text-[11px] leading-relaxed text-ink-faint mt-2">
            Built with Claude (Anthropic) as a pair programmer: data-source research and verification,
            pipeline and application code, and this page. Every external endpoint was opened and probed
            before use; the results of those probes are in <span className="num">scripts/sources.json</span>.
          </p>
        </Panel>
      </div>
    </div>
  );
}
