/**
 * Science target adapter.
 *
 * TO GO LIVE: load the science-team target package for the sol. Each point's
 * `groundViewSlot` is where a real Curiosity raw frame (Mastcam / Navcam /
 * MAHLI) is attached, fetched by sol + camera from the MSL raw-image API
 * configured in config.ts.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getSciencePoints } from '../mock/science';
import { USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const scienceAdapter: LayerAdapter = {
  id: 'science-waypoints',
  name: 'Science waypoints',
  mission: 'Science team target package',
  instrument: 'Target list + rover context frames',
  kind: 'science',
  isMock: !USE_REAL_DATA.science,
  provenance:
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
