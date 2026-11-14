/**
 * Read every loaded layer at one point on the surface.
 *
 * This is the "click anywhere" readout. It works off loaded LayerData rather
 * than the mock generators, so it keeps working unchanged once real adapters
 * are plugged in.
 */

import { formatLatLon, localToGrid } from './geo';
import type { LocalPoint } from './geo';
import { sampleGridBilinear, sampleGridNearest } from './raster';
import { pointInRing } from './contour';
import { LAYER_REGISTRY } from '../data/config';
import type { LayerData, ProbeReading } from '../data/types';
import { radDoseRateAt, weatherAt } from '../data/mock/environment';

function fmt(v: number, digits = 1): string {
  return v.toFixed(digits);
}

export interface ProbeResult {
  point: LocalPoint;
  latLon: string;
  grid: { col: number; row: number };
  readings: ProbeReading[];
}

export function probeAt(
  point: LocalPoint,
  loaded: Record<string, LayerData | undefined>,
  evaStartHour: number,
): ProbeResult {
  const readings: ProbeReading[] = [];

  for (const adapter of LAYER_REGISTRY) {
    const data = loaded[adapter.id];
    if (!data) continue;

    const base = {
      layerId: adapter.id,
      layerName: adapter.name,
      mission: adapter.mission,
      instrument: adapter.instrument,
      isMock: adapter.isMock,
    };

    if (data.type === 'raster-grid') {
      const v = sampleGridBilinear(data.values, data.width, data.height, point);
      let tone: ProbeReading['tone'] = 'nominal';
      if (adapter.kind === 'topographic' && data.unit === '°') {
        tone = v >= 20 ? 'danger' : v >= 15 ? 'caution' : 'nominal';
      }
      readings.push({
        ...base,
        value: fmt(v, data.unit === 'm' ? 1 : 1) + ' ' + data.unit,
        tone,
      });
    } else if (data.type === 'categorical-grid') {
      const code = sampleGridNearest(data.codes, data.width, data.height, point);
      const cat = data.categories.find((c) => c.code === code);
      readings.push({ ...base, value: cat ? cat.label : 'unclassified' });
    } else if (data.type === 'vector') {
      const hits = data.features.filter((f) => pointInRing(point, f.ring));
      if (hits.length === 0) {
        readings.push({ ...base, value: 'Clear of mapped hazards', tone: 'nominal' });
      } else {
        const barred = hits.some((h) => !h.passable);
        readings.push({
          ...base,
          value: hits.map((h) => h.label).join(', ') + (barred ? ' (barred)' : ''),
          tone: barred ? 'danger' : 'caution',
        });
      }
    } else if (data.type === 'points') {
      let nearest = data.points[0];
      let best = Infinity;
      for (const p of data.points) {
        const d = Math.hypot(p.position.x - point.x, p.position.y - point.y);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      readings.push({
        ...base,
        value: nearest ? nearest.code + ' ' + nearest.title + ' at ' + fmt(best, 0) + ' m' : 'none',
      });
    } else if (data.type === 'timeseries') {
      if (adapter.kind === 'radiation') {
        const rate = radDoseRateAt(evaStartHour);
        readings.push({
          ...base,
          value: fmt(rate, 2) + ' mGy/day at EVA start',
          tone: rate > 1.2 ? 'danger' : rate > 0.8 ? 'caution' : 'nominal',
        });
      } else {
        const w = weatherAt(evaStartHour);
        readings.push({
          ...base,
          value: fmt(w.airTempC, 0) + ' °C / ' + fmt(w.windMs, 1) + ' m/s / τ ' + fmt(w.tau, 2),
        });
      }
    }
  }

  const gi = localToGrid(point);
  return { point, latLon: formatLatLon(point), grid: gi, readings };
}
