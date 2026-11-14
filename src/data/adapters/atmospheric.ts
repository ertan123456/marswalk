/**
 * Atmosphere adapter — Curiosity REMS.
 *
 * TO GO LIVE: ingest the REMS ENVRDR hourly table for the chosen sol (air and
 * ground temperature, pressure, wind, UV) and the Mastcam-derived column dust
 * opacity for the same sol. Series keys stay the same, so the briefing panel and
 * the charts need no change.
 */

import { getWeather, SOL_HOURS } from '../models/environment';
import type { LayerAdapter, LayerData } from '../types';

export const atmosphericAdapter: LayerAdapter = {
  id: 'rems-weather',
  name: 'Surface weather',
  mission: 'Mars Science Laboratory (Curiosity)',
  instrument: 'REMS + Mastcam tau',
  kind: 'atmospheric',
  group: 'Environment',
  provenance: 'MODELED',
  credit: 'NASA/JPL-Caltech/CAB',
  sourceUrl: 'https://mars.nasa.gov/msl/spacecraft/instruments/rems/',
  sourceNote:
    'Hourly over one sol (' +
    SOL_HOURS.toFixed(2) +
    ' h). Air temperature at 1.6 m boom height; column dust opacity from direct-sun imaging.',
  defaultVisible: false,
  defaultOpacity: 1,
  mapRenderable: false,
  legend: {
    type: 'chart',
    unit: 'mixed',
    note: 'Drives the EVA window: suit thermal margin follows ground temperature, and wind plus dust opacity set the visibility and dust-ingress limits.',
  },
  async load(): Promise<LayerData> {
    const w = getWeather();
    return { type: 'timeseries', samples: w.samples, series: w.series, events: w.events };
  },
};
