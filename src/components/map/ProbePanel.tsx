import { AOI } from '../../lib/geo';
import { profileStats } from '../../lib/planner';
import { useMission } from '../../store/useMission';
import { Badge, Button, Panel } from '../ui/primitives';
import { Plot } from '../ui/Chart';

export function ProbePanel() {
  const probe = useMission((s) => s.probe);
  const clearProbe = useMission((s) => s.clearProbe);
  if (!probe) return null;

  return (
    <Panel
      title="Surface readout"
      right={
        <Button onClick={clearProbe} title="Close">
          close
        </Button>
      }
      dense
      className="w-[320px] shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
    >
      <div className="px-3 py-2 border-b border-line/60">
        <div className="num text-[11px] text-mars-300">{probe.latLon}</div>
        <div className="num text-[10px] text-ink-faint mt-0.5">
          {Math.round(probe.point.x)} E / {Math.round(probe.point.y)} N m (AOI local) &middot; DEM cell{' '}
          {probe.grid.col},{probe.grid.row}
        </div>
      </div>
      <div className="max-h-[42vh] overflow-y-auto">
        {probe.readings.map((r) => (
          <div key={r.layerId} className="px-3 py-1.5 border-b border-line/40 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-ink-dim">{r.layerName}</span>
              <span
                className={
                  'num text-[11px] text-right ' +
                  (r.tone === 'danger'
                    ? 'text-danger'
                    : r.tone === 'caution'
                      ? 'text-caution'
                      : r.tone === 'nominal'
                        ? 'text-nominal'
                        : 'text-ink')
                }
              >
                {r.value}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] text-ink-faint truncate">{r.instrument}</span>
              {r.isMock && <Badge tone="mock">mock</Badge>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function MeasurePanel() {
  const measureMode = useMission((s) => s.measureMode);
  const setMeasureMode = useMission((s) => s.setMeasureMode);
  const profile = useMission((s) => s.measureProfile);
  const clearMeasure = useMission((s) => s.clearMeasure);
  const measureA = useMission((s) => s.measureA);

  if (!measureMode) return null;

  const stats = profile ? profileStats(profile) : null;
  const total = profile ? profile[profile.length - 1].distM : 0;

  return (
    <Panel
      title="Measure"
      right={
        <div className="flex gap-1">
          <Button onClick={clearMeasure}>clear</Button>
          <Button onClick={() => setMeasureMode(false)}>exit</Button>
        </div>
      }
      className="w-[340px] shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
    >
      {!profile && (
        <p className="text-[11px] text-ink-dim leading-relaxed">
          {measureA
            ? 'First point set. Click a second point to cut an elevation profile between them.'
            : 'Click two points on the map to measure ground distance and cut an elevation profile.'}
        </p>
      )}
      {profile && stats && (
        <div>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <div>
              <div className="label">dist</div>
              <div className="num text-sm text-ink">{total.toFixed(0)} m</div>
            </div>
            <div>
              <div className="label">net</div>
              <div className="num text-sm text-ink">
                {stats.netRise >= 0 ? '+' : ''}
                {stats.netRise.toFixed(1)} m
              </div>
            </div>
            <div>
              <div className="label">gain</div>
              <div className="num text-sm text-mars-300">{stats.gain.toFixed(1)} m</div>
            </div>
            <div>
              <div className="label">max slope</div>
              <div
                className={
                  'num text-sm ' +
                  (stats.maxSlope >= 20 ? 'text-danger' : stats.maxSlope >= 15 ? 'text-caution' : 'text-nominal')
                }
              >
                {stats.maxSlope.toFixed(1)}&deg;
              </div>
            </div>
          </div>
          <Plot
            height={110}
            xLabel="m along"
            yLabel="elev (m)"
            series={[
              {
                key: 'elev',
                label: 'Elevation',
                unit: 'm',
                color: '#ff8f4d',
                area: true,
                points: profile.map((p) => ({ x: p.distM, y: p.elevation })),
              },
            ]}
            hoverFormat={(x, vals) => [
              x.toFixed(0) + ' m → ' + vals[0].y.toFixed(1) + ' m',
            ]}
          />
          <p className="text-[10px] text-ink-faint mt-1">
            Straight-line cut through the HiRISE DTM at {(AOI.sizeM / AOI.grid).toFixed(2)} m posting. The planner
            routes around what this cut walks straight through.
          </p>
        </div>
      )}
    </Panel>
  );
}
