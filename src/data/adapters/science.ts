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
    'Six sampling stations, each pinned to a position Curiosity was actually surveyed at on the ' +
    'sol given — the coordinates and quoted elevations are measured, not placed by eye. Ordered ' +
    'by sol, which here is also ascending elevation: Glen Torridon (2300) up to the boxwork ' +
    'region (4893). The station titles and the task-time estimates are ours, not NASA’s.',
  defaultVisible: true,
  defaultOpacity: 1,
  mapRenderable: true,
  legend: {
    type: 'points',
    note: 'Ordered GT-01 through BX-06. The planner solves the traverse in this order; drop a station from the list to take it out of the EVA.',
  },
  async load(): Promise<LayerData> {
    return { type: 'points', points: getSciencePoints(), bounds: { ...BOUNDS_M } };
  },
};
