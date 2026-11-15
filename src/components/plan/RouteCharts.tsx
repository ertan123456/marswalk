import { useMemo } from 'react';
import { getRadiation, SOL_HOURS, SPE_EVENT } from '../../data/models/environment';
import { getWeather } from '../../data/models/environment';
import type { RoutePlan } from '../../lib/planner';
import { formatMLST } from '../../lib/format';
import { useMission } from '../../store/useMission';
import { Legend, Plot } from '../ui/Chart';
import { Panel } from '../ui/primitives';

/** Elevation along the traverse, with the walk-back violation shaded red. */
export function ElevationProfileChart({ plan }: { plan: RoutePlan }) {
  const traverseProgress = useMission((s) => s.traverseProgress);

  const { elev, bands, markers } = useMemo(() => {
    const step = Math.max(1, Math.floor(plan.samples.length / 320));
    const elev = plan.samples
      .filter((_, i) => i % step === 0 || i === plan.samples.length - 1)
      .map((s) => ({ x: s.cumDistM, y: s.elevation }));

    const bands: { from: number; to: number; color: string }[] = [];
    let runStart: number | null = null;
    for (const s of plan.samples) {
      if (!s.walkBackOk && runStart === null) runStart = s.cumDistM;
      if (s.walkBackOk && runStart !== null) {
        bands.push({ from: runStart, to: s.cumDistM, color: 'rgba(239,68,68,0.16)' });
        runStart = null;
      }
    }
    if (runStart !== null) {
      bands.push({ from: runStart, to: plan.totalDistanceM, color: 'rgba(239,68,68,0.16)' });
    }

    const markers = plan.stations
      .filter((s) => s.kind === 'science')
      .map((s) => ({
        x: plan.samples[s.sampleIndex]?.cumDistM ?? 0,
        color: s.walkBackOk ? '#ff8f4d' : '#ef4444',
        dashed: true,
      }));

    return { elev, bands, markers };
  }, [plan]);

  const cursorDist = plan.samples.length
    ? plan.samples[Math.round(traverseProgress * (plan.samples.length - 1))].cumDistM
    : 0;

  return (
    <div>
      <Plot
        height={140}
        xLabel="m along traverse"
        yLabel="elev (m)"
        bands={bands}
        markers={[...markers, { x: cursorDist, color: '#ffffff', dashed: false }]}
        series={[
          {
            key: 'elev',
            label: 'Elevation',
            unit: 'm',
            color: '#ff8f4d',
            area: true,
            points: elev,
          },
        ]}
        xTickFormat={(v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)))}
        hoverFormat={(x, vals) => [x.toFixed(0) + ' m', vals[0].y.toFixed(1) + ' m']}
      />
      <Legend
        series={[
          { label: 'Ground profile', color: '#ff8f4d' },
          { label: 'Station', color: '#ffb27a' },
          { label: 'Past walk-back limit (dotted on map)', color: '#ef4444' },
        ]}
      />
    </div>
  );
}

/**
 * The walk-back chart: consumables actually left against consumables needed to
 * get home with the reserve intact. Where the lines cross, the EVA is committed.
 */
export function WalkBackChart({ plan }: { plan: RoutePlan }) {
  const suit = useMission((s) => s.suit);

  const { remaining, required } = useMemo(() => {
    const step = Math.max(1, Math.floor(plan.samples.length / 300));
    const keep = plan.samples.filter((_, i) => i % step === 0 || i === plan.samples.length - 1);
    return {
      remaining: keep.map((s) => ({ x: s.cumDistM, y: suit.evaBudgetH - s.consumablesH })),
      required: keep.map((s) => ({
        x: s.cumDistM,
        y: Math.min(suit.evaBudgetH * 1.1, s.returnConsumablesH + plan.reserveH),
      })),
    };
  }, [plan, suit.evaBudgetH]);

  return (
    <div>
      <Plot
        height={130}
        xLabel="m along traverse"
        yLabel="cons. (h)"
        series={[
          { key: 'rem', label: 'Consumables remaining', unit: 'h', color: '#3ddc97', points: remaining, area: true },
          { key: 'req', label: 'Needed to abort home + reserve', unit: 'h', color: '#ef4444', points: required, dashed: true },
        ]}
        xTickFormat={(v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)))}
        yTickFormat={(v) => v.toFixed(1)}
        hoverFormat={(x, vals) => [
          x.toFixed(0) + ' m',
          'have ' + vals[0].y.toFixed(2) + ' h',
          'need ' + vals[1].y.toFixed(2) + ' h',
        ]}
      />
      <Legend
        series={[
          { label: 'Remaining', color: '#3ddc97', unit: 'h' },
          { label: 'Abort + reserve', color: '#ef4444', unit: 'h' },
        ]}
      />
    </div>
  );
}

/** RAD dose rate across the sol, with the EVA window and the SPE marked. */
export function RadiationChart({ plan }: { plan: RoutePlan | null }) {
  const suit = useMission((s) => s.suit);
  const rad = getRadiation();

  const bands = [
    {
      from: SPE_EVENT.startHour,
      to: SPE_EVENT.endHour,
      color: 'rgba(239,68,68,0.18)',
    },
  ];
  if (plan) {
    bands.unshift({
      from: suit.evaStartHour,
      to: Math.min(SOL_HOURS, suit.evaStartHour + plan.totalTimeH),
      color: 'rgba(90,214,232,0.12)',
    });
  }

  return (
    <div>
      <Plot
        height={130}
        xLabel="local solar time"
        yLabel="mSv/day"
        bands={bands}
        series={[
          {
            key: 'rate',
            label: 'Dose rate',
            unit: 'mSv/day',
            color: '#f2b53a',
            area: true,
            points: rad.samples.map((s) => ({ x: s.hour, y: s.doseRate })),
          },
        ]}
        xTickFormat={(v) => formatMLST(v)}
        yTickFormat={(v) => v.toFixed(1)}
        hoverFormat={(x, vals) => [formatMLST(x), vals[0].y.toFixed(2) + ' mSv/day']}
      />
      <Legend
        series={[
          { label: 'RAD dose rate', color: '#f2b53a' },
          { label: 'EVA window', color: '#5ad6e8' },
          { label: 'SPE forecast', color: '#ef4444' },
        ]}
      />
    </div>
  );
}

/** REMS conditions across the sol. */
export function WeatherChart() {
  const suit = useMission((s) => s.suit);
  const plan = useMission((s) => s.plan);
  const wx = getWeather();

  const bands = plan
    ? [
        {
          from: suit.evaStartHour,
          to: Math.min(SOL_HOURS, suit.evaStartHour + plan.totalTimeH),
          color: 'rgba(90,214,232,0.12)',
        },
      ]
    : [];

  return (
    <div>
      <Plot
        height={140}
        xLabel="local solar time"
        yLabel={"°C"}
        yRightLabel={"m/s · τ"}
        bands={bands}
        series={[
          {
            key: 'air',
            label: 'Air temp',
            unit: '°C',
            color: '#5ad6e8',
            points: wx.samples.map((s) => ({ x: s.hour, y: s.airTempC })),
          },
          {
            key: 'ground',
            label: 'Ground temp',
            unit: '°C',
            color: '#ff8f4d',
            points: wx.samples.map((s) => ({ x: s.hour, y: s.groundTempC })),
          },
          {
            key: 'wind',
            label: 'Wind',
            unit: 'm/s',
            color: '#3ddc97',
            axis: 'right',
            dashed: true,
            points: wx.samples.map((s) => ({ x: s.hour, y: s.windMs })),
          },
        ]}
        xTickFormat={(v) => formatMLST(v)}
        hoverFormat={(x, vals) => [
          formatMLST(x),
          'air ' + vals[0].y.toFixed(0) + ' °C',
          'ground ' + vals[1].y.toFixed(0) + ' °C',
          'wind ' + vals[2].y.toFixed(1) + ' m/s',
        ]}
      />
      <Legend
        series={[
          { label: 'Air (1.6 m)', color: '#5ad6e8' },
          { label: 'Ground', color: '#ff8f4d' },
          { label: 'Wind', color: '#3ddc97' },
        ]}
      />
    </div>
  );
}

export function InstrumentCharts() {
  const plan = useMission((s) => s.plan);
  return (
    <div className="space-y-2">
      <Panel title={"Radiation · MSL RAD"}>
        <RadiationChart plan={plan} />
      </Panel>
      <Panel title={"Surface weather · MSL REMS"}>
        <WeatherChart />
      </Panel>
    </div>
  );
}
