import { lazy, Suspense, useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { MapView } from './components/map/MapView';
import { LayerPanel } from './components/map/LayerPanel';
import { MeasurePanel, ProbePanel } from './components/map/ProbePanel';
import { PlanPanel } from './components/plan/PlanPanel';
import { InstrumentCharts } from './components/plan/RouteCharts';

// three.js is ~900 kB of the bundle and only two of the four modes need it, so
// the field views load on demand and PLAN mode stays fast.
const TerrainView = lazy(() => import('./components/three/TerrainView').then((m) => ({ default: m.TerrainView })));
const HudView = lazy(() => import('./components/hud/HudView').then((m) => ({ default: m.HudView })));
const Briefing = lazy(() => import('./components/briefing/Briefing').then((m) => ({ default: m.Briefing })));
import { Button } from './components/ui/primitives';
import { useMission } from './store/useMission';

function BootScreen() {
  const stage = useMission((s) => s.bootStage);
  return (
    <div className="fixed inset-0 grid place-items-center bg-void z-50">
      <div className="w-[min(420px,86vw)]">
        <div className="font-mono text-[22px] tracking-[0.3em] text-mars-400">MARSWALK</div>
        <div className="label mt-1">Gale Crater &middot; Mount Sharp boxwork region</div>
        <div className="mt-6 h-[2px] bg-deck-600 overflow-hidden rounded-full">
          <div className="h-full w-1/3 bg-mars-400 animate-[boot_1.1s_ease-in-out_infinite]" />
        </div>
        <div className="num text-[11px] text-ink-dim mt-2.5">{stage}</div>
        <style>{'@keyframes boot{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
      </div>
    </div>
  );
}

function ModeLoading() {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="num text-[11px] text-ink-faint tracking-[0.2em]">LOADING DISPLAY…</div>
    </div>
  );
}

function PlanMode() {
  const [drawer, setDrawer] = useState<'layers' | 'plan' | null>(null);
  const measureMode = useMission((s) => s.measureMode);
  const setMeasureMode = useMission((s) => s.setMeasureMode);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* left rail — layers */}
      <aside className="hidden xl:flex w-[320px] shrink-0 border-r border-line flex-col overflow-y-auto p-2 gap-2">
        <LayerPanel />
        <InstrumentCharts />
      </aside>

      {/* map */}
      <div className="relative flex-1 min-w-0">
        <MapView />

        {/* map tools */}
        <div className="absolute top-2.5 right-2.5 z-[500] flex flex-col items-end gap-1.5">
          <Button active={measureMode} onClick={() => setMeasureMode(!measureMode)} title="Measure distance and cut an elevation profile">
            measure
          </Button>
          <div className="xl:hidden flex flex-col gap-1.5">
            <Button active={drawer === 'layers'} onClick={() => setDrawer(drawer === 'layers' ? null : 'layers')}>
              layers
            </Button>
            <Button active={drawer === 'plan'} onClick={() => setDrawer(drawer === 'plan' ? null : 'plan')}>
              plan
            </Button>
          </div>
        </div>

        {/* readouts */}
        <div className="absolute bottom-2.5 left-2.5 z-[500] flex flex-col gap-2 max-w-[calc(100%-1.25rem)]">
          <MeasurePanel />
          <ProbePanel />
        </div>

        {/* tablet drawers */}
        {drawer && (
          <div className="xl:hidden absolute inset-y-0 right-0 z-[600] w-[min(380px,92vw)] border-l border-line bg-void/97 backdrop-blur overflow-y-auto p-2 space-y-2">
            <div className="flex justify-end">
              <Button onClick={() => setDrawer(null)}>close</Button>
            </div>
            {drawer === 'layers' ? (
              <>
                <LayerPanel />
                <InstrumentCharts />
              </>
            ) : (
              <PlanPanel />
            )}
          </div>
        )}
      </div>

      {/* right rail — the plan */}
      <aside className="hidden xl:block w-[380px] shrink-0 border-l border-line overflow-y-auto p-2">
        <PlanPanel />
      </aside>
    </div>
  );
}

export default function App() {
  const booted = useMission((s) => s.booted);
  const boot = useMission((s) => s.boot);
  const mode = useMission((s) => s.mode);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (!booted) return <BootScreen />;

  return (
    <div className="h-full flex flex-col bg-void">
      <TopBar />
      {mode === 'PLAN' && <PlanMode />}
      <Suspense fallback={<ModeLoading />}>
        {mode === '3D' && <TerrainView />}
        {mode === 'HUD' && <HudView />}
        {mode === 'BRIEFING' && <Briefing />}
      </Suspense>
    </div>
  );
}
