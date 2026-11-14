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
const About = lazy(() => import('./components/about/About').then((m) => ({ default: m.About })));
import { Button, Segmented } from './components/ui/primitives';
import { TourOverlay } from './components/TourOverlay';
import { Landing } from './components/Landing';
import { useMission } from './store/useMission';

function ModeLoading() {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="num text-[11px] text-ink-faint tracking-[0.2em]">LOADING DISPLAY…</div>
    </div>
  );
}

function PlanMode() {
  const [drawer, setDrawer] = useState<'layers' | 'plan' | null>(null);
  const [rail, setRail] = useState<'layers' | 'instruments'>('layers');
  const measureMode = useMission((s) => s.measureMode);
  const setMeasureMode = useMission((s) => s.setMeasureMode);
  const railOpen = useMission((s) => s.railOpen);

  // Below xl the rails collapse into a drawer, so Escape has to close that
  // first. Capture phase on window, so the global shortcut handler (which
  // would otherwise clear the probe on the same keypress) never sees it.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDrawer(null);
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawer]);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* left rail — layers or instruments, one at a time */}
      {railOpen && (
      <aside aria-label="Data layers and instruments" className="hidden xl:flex w-[320px] shrink-0 border-r border-line flex-col overflow-y-auto p-2 gap-2">
        <Segmented
          idPrefix="left-rail"
          ariaLabel="Left rail contents"
          value={rail}
          onChange={setRail}
          options={[
            { value: 'layers', label: 'layers' },
            { value: 'instruments', label: 'instruments' },
          ]}
        />
        <div
          id="left-rail-panel"
          role="tabpanel"
          aria-labelledby={`left-rail-tab-${rail}`}
          className="flex flex-col gap-2"
        >
          {rail === 'layers' ? <LayerPanel /> : <InstrumentCharts />}
        </div>
      </aside>
      )}

      {/* map */}
      <main aria-label="Planning map" className="relative flex-1 min-w-0">
        <MapView />

        {/* map tools */}
        <div className="absolute top-2.5 right-2.5 z-[500] flex flex-col items-end gap-1.5">
          <Button active={measureMode} onClick={() => setMeasureMode(!measureMode)} title="Measure distance and cut an elevation profile">
            measure
          </Button>
          <div className="xl:hidden flex flex-col gap-1.5">
            <Button
              active={drawer === 'layers'}
              ariaExpanded={drawer === 'layers'}
              ariaControls="plan-drawer"
              title="Show the data layers and instruments"
              onClick={() => setDrawer(drawer === 'layers' ? null : 'layers')}
            >
              layers
            </Button>
            <Button
              active={drawer === 'plan'}
              ariaExpanded={drawer === 'plan'}
              ariaControls="plan-drawer"
              title="Show the EVA plan and Mission AI"
              onClick={() => setDrawer(drawer === 'plan' ? null : 'plan')}
            >
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
          <aside
            id="plan-drawer"
            aria-label={drawer === 'layers' ? 'Data layers and instruments' : 'EVA plan'}
            className="xl:hidden absolute inset-y-0 right-0 z-[600] w-[min(380px,92vw)] border-l border-line bg-void/97 backdrop-blur overflow-y-auto p-2 space-y-2"
          >
            <div className="flex justify-end">
              <Button onClick={() => setDrawer(null)} title="Close this panel (Esc)">
                close
              </Button>
            </div>
            {drawer === 'layers' ? (
              <>
                <Segmented
                  idPrefix="drawer-rail"
                  ariaLabel="Drawer contents"
                  value={rail}
                  onChange={setRail}
                  options={[
                    { value: 'layers', label: 'layers' },
                    { value: 'instruments', label: 'instruments' },
                  ]}
                />
                {rail === 'layers' ? <LayerPanel /> : <InstrumentCharts />}
              </>
            ) : (
              <PlanPanel />
            )}
          </aside>
        )}
      </main>

      {/* right rail — the plan */}
      <aside aria-label="EVA plan" className="hidden xl:block w-[380px] shrink-0 border-l border-line overflow-y-auto p-2">
        <PlanPanel />
      </aside>
    </div>
  );
}

const MODE_KEYS: Record<string, 'PLAN' | '3D' | 'HUD' | 'BRIEFING' | 'ABOUT'> = {
  '1': 'PLAN',
  '2': '3D',
  '3': 'HUD',
  '4': 'BRIEFING',
  '5': 'ABOUT',
};

export default function App() {
  const started = useMission((s) => s.started);
  const boot = useMission((s) => s.boot);
  const mode = useMission((s) => s.mode);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Keyboard shortcuts. Ignored while the user is typing in a field, and the
  // tour swallows them so a stray key cannot fight the demo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const st = useMission.getState();
      const k = e.key.toLowerCase();

      if (e.key === 'Escape') {
        if (st.tourRunning) st.stopTour();
        else if (st.measureMode) st.setMeasureMode(false);
        else st.clearProbe();
        return;
      }
      if (st.tourRunning) {
        // any other key ends the demo rather than fighting it
        st.stopTour();
        return;
      }
      if (MODE_KEYS[e.key]) {
        st.setMode(MODE_KEYS[e.key]);
        e.preventDefault();
        return;
      }
      if (k === 'g') st.startTour();
      else if (k === 'l') st.toggleRail();
      else if (k === 'm') st.setMeasureMode(!st.measureMode);
      else if (k === 'w') st.setShowWalkBack(!st.showWalkBack);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!started) return <Landing />;

  return (
    <div className="h-full flex flex-col bg-void">
      <TopBar />
      {mode === 'PLAN' && <PlanMode />}
      <TourOverlay />
      <Suspense fallback={<ModeLoading />}>
        {mode === '3D' && <TerrainView />}
        {mode === 'HUD' && <HudView />}
        {mode === 'BRIEFING' && <Briefing />}
        {mode === 'ABOUT' && <About />}
      </Suspense>
    </div>
  );
}
