import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DRAPEABLE_LAYER_IDS, getAdapter } from '../../data/config';
import { formatDistance, formatDuration } from '../../lib/format';
import { useMission } from '../../store/useMission';
import { Badge, Button, Panel, Readout, Slider } from '../ui/primitives';
import { MarsScene } from './Scene';

function DrapeSelector() {
  const drapeLayerId = useMission((s) => s.drapeLayerId);
  const setDrapeLayerId = useMission((s) => s.setDrapeLayerId);
  return (
    <div className="space-y-1">
      {DRAPEABLE_LAYER_IDS.map((id) => {
        const a = getAdapter(id);
        if (!a) return null;
        const active = drapeLayerId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setDrapeLayerId(id)}
            className={
              'w-full text-left px-2 py-1.5 border rounded-[2px] cursor-pointer transition-colors ' +
              (active ? 'border-mars-400 bg-mars-500/15' : 'border-line/60 hover:border-line bg-deck-800/40')
            }
          >
            <div className="flex items-center gap-1.5">
              <span className={'text-[11px] ' + (active ? 'text-mars-300' : 'text-ink-dim')}>{a.name}</span>
              {(a.provenance !== 'REAL') && <Badge tone="mock">mock</Badge>}
            </div>
            <div className="text-[9px] text-ink-faint truncate">{a.instrument}</div>
          </button>
        );
      })}
    </div>
  );
}

export function TerrainView() {
  const exaggeration = useMission((s) => s.exaggeration);
  const setExaggeration = useMission((s) => s.setExaggeration);
  const flying = useMission((s) => s.flying);
  const setFlying = useMission((s) => s.setFlying);
  const progress = useMission((s) => s.traverseProgress);
  const setProgress = useMission((s) => s.setTraverseProgress);
  const plan = useMission((s) => s.plan);
  const setMode = useMission((s) => s.setMode);

  const sample =
    plan && plan.samples.length
      ? plan.samples[Math.min(plan.samples.length - 1, Math.round(progress * (plan.samples.length - 1)))]
      : null;

  return (
    <div className="flex-1 min-h-0 relative">
      <Canvas
        camera={{ position: [-6400, 8600, 13200], fov: 42, near: 5, far: 90000 }}
        gl={{ antialias: true }}
        dpr={[1, 1.8]}
      >
        <MarsScene />
        {!flying && (
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.08}
            minDistance={200}
            maxDistance={42000}
            target={[0, 0, 0]}
          />
        )}
      </Canvas>

      <div className="absolute top-2.5 left-2.5 w-[260px] space-y-2">
        <Panel title="Draped layer">
          <DrapeSelector />
          <div className="mt-3">
            <Slider
              label="Vertical exaggeration"
              value={exaggeration}
              min={1}
              max={6}
              step={0.1}
              unit="×"
              onChange={setExaggeration}
              format={(v) => v.toFixed(1)}
            />
          </div>
          <p className="text-[10px] text-ink-faint leading-relaxed mt-1.5">
            Real relief across the AOI is ~290 m over 4 km. At 1× the foothills look flat, which is exactly why crews
            misjudge them.
          </p>
        </Panel>
      </div>

      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-end gap-2">
        <Panel title="Traverse playback" className="flex-1 min-w-[280px] max-w-[560px]">
          <div className="flex items-center gap-2">
            <Button tone="accent" active={flying} onClick={() => setFlying(!flying)}>
              {flying ? 'pause fly-through' : 'fly-through'}
            </Button>
            <Button onClick={() => setProgress(0)}>reset</Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="flex-1 cursor-pointer"
            />
            <Button onClick={() => setMode('HUD')} title="Put the same position on the helmet visor">
              to hud
            </Button>
          </div>
          {sample && plan && (
            <div className="grid grid-cols-4 gap-3 mt-3">
              <Readout label="along" value={formatDistance(sample.cumDistM)} size="sm" />
              <Readout label="elapsed" value={formatDuration(sample.timeH)} size="sm" />
              <Readout label="elev" value={Math.round(sample.elevation) + ' m'} size="sm" />
              <Readout
                label="walk-back"
                value={sample.walkBackOk ? 'OK' : 'EXCEEDED'}
                tone={sample.walkBackOk ? 'nominal' : 'danger'}
                size="sm"
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
