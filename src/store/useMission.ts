/** Single Zustand store for mode, layer state, the plan, and the field views. */

import { create } from 'zustand';
import type { LayerData } from '../data/types';
import { LAYER_IDS, LAYER_REGISTRY, loadLayer } from '../data/config';
import type { LocalPoint } from '../lib/geo';
import { DEFAULT_SUIT, planRoute, straightProfile } from '../lib/planner';
import type { ProfilePoint, RoutePlan, SuitModel } from '../lib/planner';
import { probeAt } from '../lib/probe';
import type { ProbeResult } from '../lib/probe';
import { getHabitat, SCIENCE_POINTS } from '../data/mock/science';

export type Mode = 'PLAN' | '3D' | 'HUD' | 'BRIEFING';

export interface LayerState {
  visible: boolean;
  opacity: number;
}

interface MissionState {
  /* --- boot --- */
  booted: boolean;
  bootStage: string;
  boot: () => Promise<void>;

  /* --- mode --- */
  mode: Mode;
  setMode: (m: Mode) => void;

  /* --- layers --- */
  layers: Record<string, LayerState>;
  layerData: Record<string, LayerData | undefined>;
  toggleLayer: (id: string) => void;
  setLayerOpacity: (id: string, v: number) => void;
  setOnlyBasemap: () => void;

  /* --- planning --- */
  suit: SuitModel;
  setSuit: (patch: Partial<SuitModel>) => void;
  resetSuit: () => void;
  waypointOrder: string[];
  toggleWaypoint: (id: string) => void;
  moveWaypoint: (id: string, dir: -1 | 1) => void;
  plan: RoutePlan | null;
  planning: boolean;
  replan: () => void;

  /* --- probe + measure --- */
  probe: ProbeResult | null;
  probePoint: (p: LocalPoint) => void;
  clearProbe: () => void;

  measureMode: boolean;
  setMeasureMode: (v: boolean) => void;
  measureA: LocalPoint | null;
  measureB: LocalPoint | null;
  measureProfile: ProfilePoint[] | null;
  pushMeasurePoint: (p: LocalPoint) => void;
  clearMeasure: () => void;

  /** red tint over ground the crew could not reach and still walk back */
  showWalkBack: boolean;
  setShowWalkBack: (v: boolean) => void;

  /* --- selection --- */
  selectedWaypointId: string | null;
  selectWaypoint: (id: string | null) => void;

  /* --- 3D + HUD --- */
  drapeLayerId: string;
  setDrapeLayerId: (id: string) => void;
  exaggeration: number;
  setExaggeration: (v: number) => void;
  traverseProgress: number;
  setTraverseProgress: (v: number) => void;
  flying: boolean;
  setFlying: (v: boolean) => void;
}

const initialLayers = (): Record<string, LayerState> => {
  const out: Record<string, LayerState> = {};
  for (const a of LAYER_REGISTRY) out[a.id] = { visible: a.defaultVisible, opacity: a.defaultOpacity };
  return out;
};

/** Rover stages forward at BX-03, per the mission plan. */
function roverStaging(): LocalPoint | null {
  const bx3 = SCIENCE_POINTS.find((p) => p.code === 'BX-03');
  return bx3 ? bx3.position : null;
}

export const useMission = create<MissionState>((set, get) => ({
  booted: false,
  bootStage: 'Standing by',

  async boot() {
    if (get().booted) return;
    // Yield to the browser between stages so the boot readout actually paints.
    // requestAnimationFrame alone stalls forever in a backgrounded tab, so race
    // it against a timer.
    const yieldFrame = () =>
      new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        requestAnimationFrame(done);
        setTimeout(done, 60);
      });

    set({ bootStage: 'Building HiRISE DTM grid (512 × 512)' });
    await yieldFrame();

    const data: Record<string, LayerData | undefined> = {};
    for (const a of LAYER_REGISTRY) {
      set({ bootStage: 'Loading ' + a.name + ' — ' + a.mission });
      await yieldFrame();
      try {
        data[a.id] = await loadLayer(a.id);
      } catch {
        data[a.id] = undefined;
      }
    }

    set({ bootStage: 'Solving EVA traverse', layerData: data });
    await yieldFrame();
    set({ booted: true, bootStage: 'Ready' });
    get().replan();
  },

  mode: 'PLAN',
  setMode: (mode) => set({ mode }),

  layers: initialLayers(),
  layerData: {},
  toggleLayer: (id) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], visible: !s.layers[id]?.visible } },
    })),
  setLayerOpacity: (id, v) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], opacity: v } } })),
  setOnlyBasemap: () =>
    set((s) => {
      const next: Record<string, LayerState> = {};
      for (const id of Object.keys(s.layers)) {
        next[id] = {
          ...s.layers[id],
          visible: id === LAYER_IDS.optical || id === LAYER_IDS.science,
        };
      }
      return { layers: next };
    }),

  suit: { ...DEFAULT_SUIT },
  setSuit: (patch) => {
    set((s) => ({ suit: { ...s.suit, ...patch } }));
    get().replan();
  },
  resetSuit: () => {
    set({ suit: { ...DEFAULT_SUIT } });
    get().replan();
  },

  waypointOrder: SCIENCE_POINTS.map((p) => p.id),
  toggleWaypoint: (id) => {
    set((s) => {
      const has = s.waypointOrder.includes(id);
      if (has) return { waypointOrder: s.waypointOrder.filter((w) => w !== id) };
      // reinsert in canonical order
      const canonical = SCIENCE_POINTS.map((p) => p.id);
      const next = [...s.waypointOrder, id].sort((a, b) => canonical.indexOf(a) - canonical.indexOf(b));
      return { waypointOrder: next };
    });
    get().replan();
  },
  moveWaypoint: (id, dir) => {
    set((s) => {
      const arr = [...s.waypointOrder];
      const i = arr.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return { waypointOrder: arr };
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { waypointOrder: arr };
    });
    get().replan();
  },

  plan: null,
  planning: false,
  replan: () => {
    const { suit, waypointOrder } = get();
    set({ planning: true });
    const waypoints = waypointOrder
      .map((id) => SCIENCE_POINTS.find((p) => p.id === id))
      .filter((p): p is (typeof SCIENCE_POINTS)[number] => Boolean(p))
      .map((p) => ({
        id: p.id,
        code: p.code,
        title: p.title,
        point: p.position,
        taskMinutes: p.taskMinutes,
      }));

    const plan = planRoute({
      start: getHabitat(),
      waypoints,
      closeLoop: true,
      suit,
      roverStaging: roverStaging(),
    });
    set({ plan, planning: false, traverseProgress: 0 });
  },

  probe: null,
  probePoint: (p) => {
    const { layerData, suit } = get();
    set({ probe: probeAt(p, layerData, suit.evaStartHour) });
  },
  clearProbe: () => set({ probe: null }),

  measureMode: false,
  setMeasureMode: (v) => set({ measureMode: v, measureA: null, measureB: null, measureProfile: null }),
  measureA: null,
  measureB: null,
  measureProfile: null,
  pushMeasurePoint: (p) =>
    set((s) => {
      if (!s.measureA || s.measureB) return { measureA: p, measureB: null, measureProfile: null };
      return { measureB: p, measureProfile: straightProfile(s.measureA, p) };
    }),
  clearMeasure: () => set({ measureA: null, measureB: null, measureProfile: null }),

  showWalkBack: false,
  setShowWalkBack: (v) => set({ showWalkBack: v }),

  selectedWaypointId: null,
  selectWaypoint: (id) => set({ selectedWaypointId: id }),

  drapeLayerId: LAYER_IDS.optical,
  setDrapeLayerId: (id) => set({ drapeLayerId: id }),
  exaggeration: 2.4,
  setExaggeration: (v) => set({ exaggeration: v }),
  traverseProgress: 0,
  setTraverseProgress: (v) => set({ traverseProgress: Math.min(1, Math.max(0, v)) }),
  flying: false,
  setFlying: (v) => set({ flying: v }),
}));
