/**
 * Science target adapter.
 *
 * TO GO LIVE: load the science-team target package for the sol. Each point's
 * `groundViewSlot` is where a real Curiosity raw frame (Mastcam / Navcam /
 * MAHLI) is attached, fetched by sol + camera from the MSL raw-image API
 * configured in config.ts.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getSciencePoints } from '../real/science';
import type { LayerAdapter, LayerData } from '../types';

export const scienceAdapter: LayerAdapter = {
  id: 'science-waypoints',
  name: 'Science waypoints',
  mission: 'Science team target package',
  instrument: 'Target list + rover context frames',
  kind: 'science',
  group: 'Geology & Minerals',
  provenance: 'REAL',
  credit: 'Positions NASA/JPL-Caltech; narrative by MARSWALK',
  sourceUrl: 'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
  sourceNote:
    'Five ranked sampling stations across the boxwork network, ordered up-slope. Task times are crew-rehearsed estimates including drill setup and sample handoff.',
  defaultVisible: true,
  defaultOpacity: 1,
  mapRenderable: true,
  legend: {
    type: 'points',
    note: 'Ordered BX-01 through BX-05. The planner solves the traverse in this order; drag a waypoint off the list to drop it from the EVA.',
  },
  async load(): Promise<LayerData> {
    return { type: 'points', points: getSciencePoints(), bounds: { ...BOUNDS_M } };
  },
};
