/**
 * Radiation adapter — Curiosity RAD, plus a space-weather forecast overlay.
 *
 * TO GO LIVE: ingest the RAD dose-rate time series from the PDS Planetary
 * Plasma Interactions node (RDR tables, dose rate in µGy/day, cadence ~30 min)
 * and convert to mGy/day. Keep the `events` array: that is where a real solar
 * particle event alert from a space-weather feed is injected.
 */

import { getRadiation, RAD_BASELINE_MGY_DAY } from '../mock/environment';
import { USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const radiationAdapter: LayerAdapter = {
  id: 'rad-dose-rate',
  name: 'Radiation dose rate',
  mission: 'Mars Science Laboratory (Curiosity)',
  instrument: 'RAD (Radiation Assessment Detector)',
  kind: 'radiation',
  isMock: !USE_REAL_DATA.radiation,
  provenance:
    'Surface dose rate in the shadow of the atmosphere, one sol at 30 min cadence. GCR baseline ~' +
    RAD_BASELINE_MGY_DAY.toFixed(2) +
    ' mGy/day. The solar particle event in this sol is injected for the exercise.',
  defaultVisible: false,
  defaultOpacity: 1,
  mapRenderable: false,
  legend: {
    type: 'chart',
    unit: 'mGy/day',
    note: 'Dose accrued on EVA is integrated over the planned window. A forecast SPE inside the window is an abort-or-shelter decision, not a margin call.',
  },
  async load(): Promise<LayerData> {
    const r = getRadiation();
    return { type: 'timeseries', samples: r.samples, series: r.series, events: r.events };
  },
};
