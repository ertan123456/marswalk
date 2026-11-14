/**
 * MOCK environment time series for the planned EVA sol.
 *
 *  - Radiation stands in for Curiosity RAD (Radiation Assessment Detector)
 *    surface dose-rate telemetry, plus one injected solar particle event.
 *  - Weather stands in for Curiosity REMS (Rover Environmental Monitoring
 *    Station) hourly air/ground temperature, pressure, wind and column dust
 *    opacity.
 *
 * Both are hourly over one Mars sol (24 h 39 m) and deterministic.
 */

import { Rng } from '../../lib/rng';
import { clamp } from '../../lib/noise';
import type { SeriesDef, TimeEvent, TimeSample } from '../types';

/** One Mars sol in hours of local mean solar time. */
export const SOL_HOURS = 24.6597;

/** Campaign sol the mission briefing is written against. */
export const EVA_SOL = 214;

/* ------------------------------------------------------------------ radiation */

export const RAD_BASELINE_MGY_DAY = 0.64;

/** The injected solar particle event, in local true solar time hours. */
export const SPE_EVENT: TimeEvent = {
  id: 'spe-214a',
  label: 'Solar particle event (forecast)',
  startHour: 13.7,
  endHour: 17.4,
  severity: 'danger',
  detail:
    'M-class flare observed on the Earth-facing limb 19 h ago; arrival window from an L1-equivalent upstream monitor. Peak surface dose rate ~6x GCR baseline. Shelter behind the habitat regolith berm or inside the pressurised rover.',
};

export interface RadiationModel {
  samples: TimeSample[];
  series: SeriesDef[];
  events: TimeEvent[];
  baselineMgyPerDay: number;
}

let radCache: RadiationModel | null = null;

/** Dose rate in mGy/day at a given local hour, including the SPE profile. */
export function radDoseRateAt(hour: number): number {
  const h = ((hour % SOL_HOURS) + SOL_HOURS) % SOL_HOURS;
  // Galactic cosmic ray dose rate is slightly anti-correlated with the
  // atmospheric column, which thickens in the cold pre-dawn hours.
  const diurnal = 1 - 0.045 * Math.cos((2 * Math.PI * (h - 5)) / SOL_HOURS);
  let rate = RAD_BASELINE_MGY_DAY * diurnal;

  if (h >= SPE_EVENT.startHour && h <= SPE_EVENT.endHour) {
    const span = SPE_EVENT.endHour - SPE_EVENT.startHour;
    const u = (h - SPE_EVENT.startHour) / span;
    // Fast rise, slow exponential decay - the classic SPE shape.
    const shape = Math.pow(u, 0.42) * Math.exp(-3.1 * u) * 2.62;
    rate += 3.45 * clamp(shape, 0, 1.3);
  }
  return rate;
}

export function getRadiation(): RadiationModel {
  if (radCache) return radCache;
  const rng = new Rng('marswalk-rad-214');
  const samples: TimeSample[] = [];
  let cumulative = 0;
  for (let h = 0; h <= SOL_HOURS; h += 0.5) {
    const rate = radDoseRateAt(h) * (1 + rng.normal() * 0.012);
    cumulative += (rate / 24) * 0.5; // mGy accrued over this half hour
    samples.push({
      hour: Number(h.toFixed(3)),
      doseRate: Number(rate.toFixed(4)),
      cumulative: Number(cumulative.toFixed(4)),
    });
  }
  radCache = {
    samples,
    series: [
      { key: 'doseRate', label: 'Surface dose rate', unit: 'mGy/day', color: '#f2b53a' },
      { key: 'cumulative', label: 'Cumulative dose', unit: 'mGy', color: '#ff8f4d' },
    ],
    events: [SPE_EVENT],
    baselineMgyPerDay: RAD_BASELINE_MGY_DAY,
  };
  return radCache;
}

/** Integrated dose in mGy over an EVA window, mGy. */
export function doseOverWindow(startHour: number, durationHours: number): number {
  const step = 1 / 60;
  let dose = 0;
  for (let t = 0; t < durationHours; t += step) {
    dose += (radDoseRateAt(startHour + t) / 24) * step;
  }
  return dose;
}

/** Does the EVA window overlap the forecast SPE? */
export function speOverlap(startHour: number, durationHours: number): { overlaps: boolean; hoursUntil: number } {
  const end = startHour + durationHours;
  const overlaps = end > SPE_EVENT.startHour && startHour < SPE_EVENT.endHour;
  return { overlaps, hoursUntil: SPE_EVENT.startHour - startHour };
}

/* -------------------------------------------------------------------- weather */

export interface WeatherModel {
  samples: TimeSample[];
  series: SeriesDef[];
  events: TimeEvent[];
}

let wxCache: WeatherModel | null = null;

export function getWeather(): WeatherModel {
  if (wxCache) return wxCache;
  const rng = new Rng('marswalk-rems-214');
  const samples: TimeSample[] = [];

  for (let h = 0; h <= SOL_HOURS; h += 1) {
    const phase = (x: number) => (2 * Math.PI * (h - x)) / SOL_HOURS;

    // Air temperature 1.6 m above the surface.
    const airTempC = -42.5 + 37.5 * Math.cos(phase(14.2)) + rng.normal() * 1.1;
    // Ground temperature swings harder than the thin air above it.
    const groundTempC = -34 + 50 * Math.cos(phase(13.1)) + rng.normal() * 1.4;
    // Pressure: diurnal + semidiurnal thermal tides on an ~865 Pa mean.
    const pressurePa =
      866 + 24 * Math.cos(phase(4.8)) + 11 * Math.cos((4 * Math.PI * (h - 2.1)) / SOL_HOURS) + rng.normal() * 1.6;
    // Wind: calm nights, afternoon up-slope flow off the crater floor.
    const day = Math.max(0, Math.cos(phase(14.5)));
    const windMs = clamp(2.4 + 9.2 * Math.pow(day, 1.45) + rng.normal() * 0.7, 0.4, 18);
    // Night katabatic flow down off Mount Sharp (from the S), day anabatic (from the N).
    const windDirDeg = (180 + 170 * Math.pow(day, 0.8) + rng.normal() * 9 + 360) % 360;
    // Column dust opacity creeping up as a regional storm fills the basin.
    const tau = clamp(0.43 + 0.16 * (h / SOL_HOURS) + 0.025 * Math.sin(phase(9)) + rng.normal() * 0.01, 0.3, 1.2);

    samples.push({
      hour: h,
      airTempC: Number(airTempC.toFixed(1)),
      groundTempC: Number(groundTempC.toFixed(1)),
      pressurePa: Number(pressurePa.toFixed(1)),
      windMs: Number(windMs.toFixed(1)),
      windDirDeg: Number(windDirDeg.toFixed(0)),
      tau: Number(tau.toFixed(3)),
    });
  }

  wxCache = {
    samples,
    series: [
      { key: 'airTempC', label: 'Air temp (1.6 m)', unit: '°C', color: '#5ad6e8' },
      { key: 'groundTempC', label: 'Ground temp', unit: '°C', color: '#ff8f4d' },
      { key: 'pressurePa', label: 'Pressure', unit: 'Pa', color: '#9aa3b2' },
      { key: 'windMs', label: 'Wind speed', unit: 'm/s', color: '#3ddc97' },
      { key: 'tau', label: 'Dust opacity', unit: 'τ', color: '#f2d06b' },
    ],
    events: [
      {
        id: 'dust-rise-214',
        label: 'Regional dust opacity rising',
        startHour: 16,
        endHour: SOL_HOURS,
        severity: 'caution',
        detail:
          'Column opacity trending from tau 0.45 to 0.60 across the sol. Reduces solar array margin and cuts visual range on the upper traverse; not an EVA stop condition on its own.',
      },
    ],
  };
  return wxCache;
}

export function weatherAt(hour: number): TimeSample {
  const wx = getWeather();
  const h = ((hour % SOL_HOURS) + SOL_HOURS) % SOL_HOURS;
  const i = Math.min(wx.samples.length - 1, Math.max(0, Math.round(h)));
  return wx.samples[i];
}
