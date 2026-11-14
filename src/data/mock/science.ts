/**
 * MOCK science target list for EVA-214.
 *
 * Stands in for the science-team target package: in flight this is a reviewed
 * target list with co-registered HiRISE context cut-outs and prior rover frames.
 * The `groundViewSlot` on each point is where a real Curiosity Mastcam /
 * Navcam raw frame is dropped in once the image adapter is live.
 */

import type { LocalPoint } from '../../lib/geo';
import type { SciencePoint } from '../types';
import { getTerrain } from './terrain';

export const SCIENCE_POINTS: SciencePoint[] = [
  {
    id: 'wp-01',
    code: 'BX-01',
    title: 'Vein Junction Alpha',
    position: { x: 1180, y: 3080 },
    targetMineral: 'Ca-sulfate (gypsum / bassanite)',
    whyItMatters:
      'A three-way boxwork junction is the one place the vein-filling sequence is exposed in cross-section. Sampling the junction tells us whether all three ridges precipitated from the same groundwater episode or whether the network grew over multiple wetting events.',
    taskMinutes: 32,
    groundViewSlot: {
      caption: 'Mastcam right-eye mosaic, 34 mm, looking SSE across the junction',
      pending: 'Awaiting MSL Mastcam raw frame (see DATA_TODO.md)',
    },
  },
  {
    id: 'wp-02',
    code: 'BX-02',
    title: 'Polygon Floor Bravo',
    position: { x: 1760, y: 2520 },
    targetMineral: 'Mg-sulfate + phyllosilicate contact',
    whyItMatters:
      'The eroded bedrock inside a boxwork polygon should preserve the host rock the veins cut through. This is the control sample: without it we cannot tell an altered vein from altered host.',
    taskMinutes: 36,
    groundViewSlot: {
      caption: 'Navcam stereo pair, nadir-biased, documenting the polygon floor fabric',
      pending: 'Awaiting MSL Navcam raw frame (see DATA_TODO.md)',
    },
  },
  {
    id: 'wp-03',
    code: 'BX-03',
    title: 'Ridge Crest Charlie',
    position: { x: 2290, y: 2180 },
    targetMineral: 'Mg-sulfate (kieserite-bearing)',
    whyItMatters:
      'The tallest continuous vein crest in the AOI, and the strongest sulfate signature on the orbital spectral map. Primary drill target: a core here dates the last groundwater flow through Mount Sharp.',
    taskMinutes: 45,
    groundViewSlot: {
      caption: 'Mastcam-Z equivalent, 110 mm, crest profile with scale bar',
      pending: 'Awaiting MSL Mastcam raw frame (see DATA_TODO.md)',
    },
  },
  {
    id: 'wp-04',
    code: 'BX-04',
    title: 'Hematite Pavement Delta',
    position: { x: 2780, y: 1760 },
    targetMineral: 'Grey crystalline hematite',
    whyItMatters:
      'Wind-scoured pavement with a hematite signature sitting directly on the sulfate unit. Establishes whether oxidation post-dates the vein network - the difference between a habitable aquifer and a late, dry alteration front.',
    taskMinutes: 26,
    groundViewSlot: {
      caption: 'Close-up imager, 5 cm standoff, pavement clast fabric',
      pending: 'Awaiting MSL MAHLI raw frame (see DATA_TODO.md)',
    },
  },
  {
    id: 'wp-05',
    code: 'BX-05',
    title: 'Upper Vein Terminus Echo',
    position: { x: 3250, y: 1180 },
    targetMineral: 'Ca-sulfate, low-concentration halide',
    whyItMatters:
      'The up-slope limit of the boxwork network. If the veins terminate here rather than simply being buried, this marks the palaeo-water table - the single most valuable number this EVA can bring home.',
    taskMinutes: 40,
    groundViewSlot: {
      caption: 'Mastcam mosaic, 100 mm, up-slope panorama from the terminus',
      pending: 'Awaiting MSL Mastcam raw frame (see DATA_TODO.md)',
    },
  },
];

export function getSciencePoints(): SciencePoint[] {
  return SCIENCE_POINTS;
}

/** The graded habitat / lander pad at the north edge of the AOI. */
export function getHabitat(): LocalPoint {
  return getTerrain().habitat;
}

export const MISSION = {
  designator: 'EVA-214',
  campaign: 'Gale Boxwork Campaign, Surface Phase C',
  objective:
    'Characterise the boxwork vein network in the Mount Sharp foothills: establish whether the polygonal ridges record one groundwater episode or several, and locate the up-slope limit of the system.',
  crew: [
    {
      callsign: 'EV1',
      role: 'Field geologist / lead',
      suit: 'xEMU-M s/n 0007',
      notes: 'Carries the drill and the sample caddy. Sets the pace.',
    },
    {
      callsign: 'EV2',
      role: 'Suit systems / documentation',
      suit: 'xEMU-M s/n 0011',
      notes: 'Runs consumables bookkeeping, stereo imaging and the comms relay check.',
    },
  ],
  roverSupport: {
    name: 'PR-2 "Tharsis"',
    kind: 'Pressurised rover',
    detail:
      'Shadows the traverse along the lower bench and stages at the BX-03 turn. Counts as a safe haven for walk-back purposes when rover support is enabled.',
  },
  habitatName: 'Hab Module 1 "Gale Base"',
} as const;
